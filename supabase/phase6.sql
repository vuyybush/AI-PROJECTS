-- Run AFTER phase5.sql. Safe to rerun: existing counters and settings are preserved.
begin;
create table if not exists public.generation_limits (
 id boolean primary key default true check(id),
 enabled boolean not null default true,
 user_daily integer not null default 10 check(user_daily between 1 and 1000),
 shared_daily_units integer not null default 9000 check(shared_daily_units between 1 and 9000)
);
insert into public.generation_limits(id) values(true) on conflict do nothing;
create table if not exists public.generation_days (
 day date primary key,
 units integer not null default 0 check(units>=0)
);
create table if not exists public.generation_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null,
 attempts integer not null default 0,
 window_start timestamptz not null default now(),
 window_attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz
);
alter table public.generation_limits enable row level security;
alter table public.generation_days enable row level security;
alter table public.generation_users enable row level security;
revoke all on public.generation_limits, public.generation_days, public.generation_users from public,anon,authenticated;

-- Only the server's service credential can reserve/release. The browser cannot
-- choose its user ID, price, quota settings, or reset any counter.
create or replace function public.reserve_generation(p_user uuid,p_engine text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cfg public.generation_limits%rowtype;
 usr public.generation_users%rowtype;
 today date := (now() at time zone 'UTC')::date;
 cost integer;
 spent integer;
 lease uuid := gen_random_uuid();
 reset_seconds integer := greatest(1,ceil(extract(epoch from ((today+1)::timestamp at time zone 'UTC')-now()))::integer);
begin
 if p_user is null or p_engine is null or p_engine not in ('schnell','phoenix') then raise exception 'invalid reservation'; end if;
 -- Model parameters are fixed by the server. Conservative rounded units for
 -- one attempt: Schnell default square/4 steps; Phoenix <=1024 square/10 steps.
 cost := case when p_engine='schnell' then 60 else 2300 end;
 -- One lock serializes the budget check and update across ALL users/instances.
 select * into strict cfg from public.generation_limits where id=true for update;
 if not cfg.enabled then return jsonb_build_object('allowed',false,'code','PAUSED','retryAfter',60); end if;
 insert into public.generation_days(day) values(today) on conflict do nothing;
 insert into public.generation_users(user_id,day) values(p_user,today) on conflict do nothing;
 select * into strict usr from public.generation_users where user_id=p_user for update;
 if usr.lease_until>now() then return jsonb_build_object('allowed',false,'code','IN_FLIGHT','retryAfter',ceil(extract(epoch from usr.lease_until-now()))::integer); end if;
 if usr.day<>today then usr.day:=today; usr.attempts:=0; end if;
 if usr.window_start<=now()-interval '1 minute' then usr.window_start:=now(); usr.window_attempts:=0; end if;
 if usr.attempts>=cfg.user_daily then return jsonb_build_object('allowed',false,'code','USER_DAILY','retryAfter',reset_seconds); end if;
 if usr.window_attempts>=2 then return jsonb_build_object('allowed',false,'code','USER_RATE','retryAfter',greatest(1,ceil(extract(epoch from usr.window_start+interval '1 minute'-now()))::integer)); end if;
 select units into strict spent from public.generation_days where day=today;
 if spent+cost>cfg.shared_daily_units then return jsonb_build_object('allowed',false,'code','SHARED_DAILY','retryAfter',reset_seconds); end if;
 update public.generation_days set units=units+cost where day=today;
 update public.generation_users set day=today,attempts=usr.attempts+1,
 window_start=usr.window_start,window_attempts=usr.window_attempts+1,
 lease_id=lease,lease_until=now()+interval '70 seconds' where user_id=p_user;
 delete from public.generation_days where day<today-7;
 return jsonb_build_object('allowed',true,'lease',lease,'remaining',cfg.user_daily-usr.attempts-1);
end $$;

create or replace function public.release_generation(p_user uuid,p_lease uuid)
returns void language sql security definer set search_path='' as $$
 update public.generation_users set lease_id=null,lease_until=null
 where user_id=p_user and lease_id=p_lease;
$$;
revoke all on function public.reserve_generation(uuid,text),public.release_generation(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_generation(uuid,text),public.release_generation(uuid,uuid) to service_role;
commit;

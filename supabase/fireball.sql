-- Run AFTER Phase 6. Safe to rerun; existing counters and settings are retained.
-- Text enhancement uses separate personal counters but shares the image budget.
begin;
create table if not exists public.prompt_enhancement_users (
 user_id uuid primary key references auth.users(id) on delete cascade,
 day date not null,
 attempts integer not null default 0,
 window_start timestamptz not null default now(),
 window_attempts integer not null default 0,
 lease_id uuid,
 lease_until timestamptz
);
alter table public.prompt_enhancement_users enable row level security;
revoke all on public.prompt_enhancement_users from public,anon,authenticated;
create or replace function public.reserve_prompt_enhancement(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 cfg public.generation_limits%rowtype;
 usr public.prompt_enhancement_users%rowtype;
 today date := (now() at time zone 'UTC')::date;
 spent integer;
 lease uuid := gen_random_uuid();
 reset_seconds integer := greatest(1,ceil(extract(epoch from ((today+1)::timestamp at time zone 'UTC')-now()))::integer);
begin
 if p_user is null then raise exception 'invalid user'; end if;
 -- Same serialization lock as reserve_generation: no independent shared budgets.
 select * into strict cfg from public.generation_limits where id=true for update;
 if not cfg.enabled then return jsonb_build_object('allowed',false,'code','PAUSED','retryAfter',60); end if;
 insert into public.generation_days(day) values(today) on conflict do nothing;
 insert into public.prompt_enhancement_users(user_id,day) values(p_user,today) on conflict do nothing;
 select * into strict usr from public.prompt_enhancement_users where user_id=p_user for update;
 if usr.lease_until>now() then return jsonb_build_object('allowed',false,'code','IN_FLIGHT','retryAfter',ceil(extract(epoch from usr.lease_until-now()))::integer); end if;
 if usr.day<>today then usr.day:=today; usr.attempts:=0; end if;
 if usr.window_start<=now()-interval '1 minute' then usr.window_start:=now(); usr.window_attempts:=0; end if;
 if usr.attempts>=20 then return jsonb_build_object('allowed',false,'code','ENHANCE_DAILY','retryAfter',reset_seconds); end if;
 if usr.window_attempts>=3 then return jsonb_build_object('allowed',false,'code','ENHANCE_RATE','retryAfter',greatest(1,ceil(extract(epoch from usr.window_start+interval '1 minute'-now()))::integer)); end if;
 select units into strict spent from public.generation_days where day=today;
 -- Fixed model: llama-3.2-3b-instruct; input <= 5,000 UTF-8 bytes,
 -- <= 384 output tokens. 60 units is a conservative reservation, not a bill.
 if spent+60>cfg.shared_daily_units then return jsonb_build_object('allowed',false,'code','SHARED_DAILY','retryAfter',reset_seconds); end if;
 update public.generation_days set units=units+60 where day=today;
 update public.prompt_enhancement_users set day=today,attempts=usr.attempts+1,
 window_start=usr.window_start,window_attempts=usr.window_attempts+1,
 lease_id=lease,lease_until=now()+interval '45 seconds' where user_id=p_user;
 delete from public.generation_days where day<today-7;
 return jsonb_build_object('allowed',true,'lease',lease,'remaining',20-usr.attempts-1);
end $$;
create or replace function public.release_prompt_enhancement(p_user uuid,p_lease uuid)
returns void language sql security definer set search_path='' as $$
 update public.prompt_enhancement_users set lease_id=null,lease_until=null where user_id=p_user and lease_id=p_lease;
$$;
revoke all on function public.reserve_prompt_enhancement(uuid),public.release_prompt_enhancement(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_prompt_enhancement(uuid),public.release_prompt_enhancement(uuid,uuid) to service_role;
commit;

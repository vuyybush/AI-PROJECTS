-- Run once in a NEW Supabase project's SQL Editor. No service-role key is used by the app.
begin;
create table public.generations (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 object_path text not null unique,
 prompt text not null check (char_length(prompt) between 3 and 1700),
 style text not null check (style in ('Cinematic','Illustration','Dreamscape','3D art')),
 engine text not null check (engine in ('schnell','phoenix')),
 canvas text not null check (canvas in ('square','landscape','portrait')),
 style_notes text not null default '' check (char_length(style_notes)<=160),
 mime_type text not null check (mime_type in ('image/jpeg','image/png')),
 created_at timestamptz not null default now(),
 constraint owned_path check (object_path = user_id::text || '/' || id::text || case when mime_type='image/png' then '.png' else '.jpg' end)
);
create index generations_user_date on public.generations(user_id,created_at desc,id desc);
alter table public.generations enable row level security;
revoke all on public.generations from anon, authenticated;
grant select, insert, delete on public.generations to authenticated;
create policy "Read own generations" on public.generations for select to authenticated using ((select auth.uid())=user_id);
create policy "Insert own generations" on public.generations for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Delete own generations" on public.generations for delete to authenticated using ((select auth.uid())=user_id);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('dreamforge-private','dreamforge-private',false,3145728,array['image/jpeg','image/png']);
create policy "Read own DreamForge objects" on storage.objects for select to authenticated using(bucket_id='dreamforge-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Upload own DreamForge objects" on storage.objects for insert to authenticated with check(bucket_id='dreamforge-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Delete own DreamForge objects" on storage.objects for delete to authenticated using(bucket_id='dreamforge-private' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;

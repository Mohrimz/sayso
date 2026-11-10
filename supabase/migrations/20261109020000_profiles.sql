-- =============================================================================
-- Profiles: job title, phone and a profile picture.
--
-- Pictures live in the public "avatars" bucket under <user id>/<random>.jpg.
-- They're public so every page can show them without signing URLs; the random
-- file name means a picture can't be found without being shown it first.
-- Everyone can only add, replace or remove files in their own folder.
-- =============================================================================

alter table public.profiles
  add column job_title text check (job_title is null or length(job_title) <= 80),
  add column phone text check (phone is null or length(phone) <= 40),
  add column avatar_path text check (avatar_path is null or length(avatar_path) <= 200);

-- People edit their own details; side and role stay server-controlled.
grant update (job_title, phone, avatar_path) on public.profiles to authenticated;

-- A profile picture must be a file in the person's own folder.
create or replace function public.profiles_avatar_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.avatar_path is distinct from old.avatar_path
     and new.avatar_path is not null
     and (new.avatar_path not like new.id::text || '/%' or new.avatar_path like '%..%') then
    raise exception 'That picture doesn''t belong to this account';
  end if;
  new.job_title := nullif(btrim(new.job_title), '');
  new.phone := nullif(btrim(new.phone), '');
  return new;
end;
$$;

create trigger profiles_avatar_guard
  before update on public.profiles
  for each row execute function public.profiles_avatar_guard();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "avatars: people upload to their own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: people replace their own files" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: people remove their own files" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Removing a file through the API first looks it up, so owners need to read their folder.
create policy "avatars: people list their own files" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

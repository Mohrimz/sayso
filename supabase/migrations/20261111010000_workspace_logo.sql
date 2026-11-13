-- A client's logo, shown wherever the client appears (sidebar, dashboard,
-- inbox). It's a square picture in the avatars bucket at
-- <workspace id>/<random>.jpg, served through /avatars like profile pictures.
-- With none set, the client's initials are shown as before.
alter table public.workspaces
  add column logo_path text check (logo_path is null or logo_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]{1,80}\.(jpe?g|png|webp)$');

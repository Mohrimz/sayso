-- =============================================================================
-- Reel covers.
--
--   cover           the cover image the team uploaded ({path, name, mime, size},
--                   a file in the content-media bucket under <ws>/<item>/cover/).
--                   Shown to the client with the post. Make can't send a custom
--                   cover to Instagram or Facebook, so after publishing the team
--                   sets it in the apps; Sayso reminds them until it's done.
--   cover_frame_ms  the moment in the video Instagram uses as the cover when
--                   Sayso publishes the reel (Instagram's "cover frame").
--   cover_set_at    when the team confirmed the cover was set after publishing.
--
-- None of these is locked once the client has seen the post: the cover can be
-- added or changed right up to publishing without asking for approval again.
-- =============================================================================

alter table public.content_items
  add column cover jsonb check (cover is null or (jsonb_typeof(cover) = 'object' and cover ? 'path')),
  add column cover_frame_ms integer check (cover_frame_ms is null or cover_frame_ms between 0 and 900000),
  add column cover_set_at timestamptz;

-- Changing the order of a post's photos and videos (which comes first).
-- Versions are otherwise fixed once uploaded, so the order changes through
-- this function only: the agency team, while the post is still being worked
-- on (planned, draft or internal review). If the latest version was already
-- sent to the client, that version stays as the client saw it and the new
-- order is saved as a new version.
create or replace function public.reorder_post_media(p_item uuid, p_keys text[])
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_item public.content_items;
  v_latest public.content_versions;
  v_media jsonb;
begin
  select * into v_item from public.content_items where id = p_item for update;
  if not found or (select auth.uid()) is null or not public.is_agency_member(v_item.workspace_id) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if v_item.status not in ('planned', 'draft', 'internal_review') then
    raise exception 'Move the post back to draft before changing the order.';
  end if;
  select * into v_latest from public.content_versions
  where content_item_id = p_item order by version_number desc limit 1;
  if v_latest.id is null then
    raise exception 'Upload the photos first.';
  end if;

  -- The same files, in the order asked for. Each file is known by its path (or link).
  select jsonb_agg(m.file order by k.pos) into v_media
  from unnest(p_keys) with ordinality as k(key, pos)
  join jsonb_array_elements(v_latest.media) as m(file) on coalesce(m.file ->> 'path', m.file ->> 'url') = k.key;
  if v_media is null
     or jsonb_array_length(v_media) <> jsonb_array_length(v_latest.media)
     or cardinality(p_keys) <> jsonb_array_length(v_latest.media)
     or (select count(distinct x) from unnest(p_keys) as x) <> cardinality(p_keys) then
    raise exception 'The photos have changed. Reload the page and try again.';
  end if;

  if v_latest.sent_to_client_at is null then
    update public.content_versions set media = v_media where id = v_latest.id;
  else
    insert into public.content_versions (content_item_id, workspace_id, version_number, media, captions, hashtags, on_screen_text, link_url, tracked_links, note)
    values (p_item, v_item.workspace_id, 0, v_media, v_item.captions, v_item.hashtags, v_item.on_screen_text, v_item.link_url, v_item.tracked_links, 'Photos reordered');
  end if;
end;
$$;

revoke execute on function public.reorder_post_media(uuid, text[]) from anon, public;
grant execute on function public.reorder_post_media(uuid, text[]) to authenticated;

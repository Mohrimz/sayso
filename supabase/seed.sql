-- =============================================================================
-- Local logins only (never push this to the cloud project). Password for both:
-- password123
--
--   admin@sayso.test            Agency admin (sees every client)
--   team@sayso.test             Agency team member (not an admin; assign clients
--                               from a client's Settings)
--
-- Real client data comes from supabase/setup/*.sql, which `db reset` runs after
-- this file (see [db.seed] in config.toml).
-- =============================================================================

do $$
declare
  u_admin uuid := '11111111-1111-4111-8111-111111111111';
  u_team  uuid := '22222222-2222-4222-8222-222222222222';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token
  )
  select '00000000-0000-0000-0000-000000000000', v.id, 'authenticated', 'authenticated', v.email,
         extensions.crypt('password123', extensions.gen_salt('bf')), now(),
         '{"provider": "email", "providers": ["email"]}'::jsonb,
         jsonb_build_object('full_name', v.name), now(), now(),
         '', '', '', '', '', '', '', ''
  from (values
    (u_admin, 'admin@sayso.test', 'Agency Admin'),
    (u_team,  'team@sayso.test', 'Test Teammate')
  ) as v(id, email, name);

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from auth.users u
  where u.id in (u_admin, u_team);

  update public.profiles set side = 'agency', agency_role = 'admin' where id = u_admin;
  update public.profiles set side = 'agency', agency_role = 'member' where id = u_team;
end;
$$;

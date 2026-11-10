-- Brand kit: free-form brand notes (who it's for, current focus, logo and photo
-- rules, hashtags, product links), for everything that isn't colours, fonts,
-- tone, topics to avoid or FAQ answers.
alter table public.brand_kits
  add column notes text check (notes is null or length(notes) <= 8000);

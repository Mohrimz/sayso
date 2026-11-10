// NEXT_PUBLIC_* values must be read with literal property access so Next.js can
// inline them into the browser bundle.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
// Links in emails come from here. On Vercel, a missing setting falls back to the
// project's production domain, so a live email can never point at localhost.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");
export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Sayso";
export const APP_TAGLINE = process.env.NEXT_PUBLIC_APP_TAGLINE ?? "Nothing goes live without your say-so.";

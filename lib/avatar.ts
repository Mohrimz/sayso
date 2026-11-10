export const AVATAR_BUCKET = "avatars";
/** Profile pictures are stored as square JPEGs this many pixels wide. */
export const AVATAR_SIZE = 400;

/**
 * Address for a profile picture, or null when there isn't one. It goes through
 * /avatars/…, which forwards to wherever files are stored (Cloudflare R2 or
 * Supabase, see lib/files).
 */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return `/avatars/${path.split("/").map(encodeURIComponent).join("/")}`;
}

import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/env";
import { r2Enabled, signedUrl } from "@/lib/files";

const DAY = 24 * 60 * 60;

/**
 * Profile pictures: /avatars/<user id>/<random>.jpg forwards to the stored file
 * (a signed Cloudflare R2 link, or Supabase's public URL). Pictures have random
 * names and were always public, so browsers may cache the redirect for a day.
 */
export async function GET(_request: Request, { params }: RouteContext<"/avatars/[...path]">) {
  const { path } = await params;
  const file = path.join("/");
  if (path.length !== 2 || !/^[0-9a-f-]{36}$/.test(path[0]) || !/^[A-Za-z0-9_-]{1,80}\.(jpe?g|png|webp)$/.test(path[1])) {
    return new NextResponse(null, { status: 404 });
  }
  const target = r2Enabled()
    ? await signedUrl("avatars", file, { expiresIn: 2 * DAY })
    : `${SUPABASE_URL}/storage/v1/object/public/avatars/${path.map(encodeURIComponent).join("/")}`;
  if (!target) return new NextResponse(null, { status: 404 });
  const response = NextResponse.redirect(target, 302);
  response.headers.set("Cache-Control", `public, max-age=${DAY}`);
  return response;
}

// Sets a client's logo: the picture shown beside the client's name in the
// sidebar, dashboard and inbox. The image is cropped to a square, saved as a
// 400px JPEG in the avatars bucket and linked on the workspace.
//
//   node --env-file=.env.local scripts/set-client-logo.mjs <client-slug> <image file>
//   node --env-file=.env.production.local scripts/set-client-logo.mjs ...   (live site)
//
// Pass "none" instead of a file to go back to initials.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { r2Enabled, r2Put } from "./r2.mjs";

const [slug, file] = process.argv.slice(2);
if (!slug || !file) {
  console.error("Usage: node --env-file=<env file> scripts/set-client-logo.mjs <client-slug> <image file | none>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be in the env file.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: workspace } = await supabase.from("workspaces").select("id, name, logo_path").eq("slug", slug).maybeSingle();
if (!workspace) {
  console.error(`No client with the address name "${slug}".`);
  process.exit(1);
}

let path = null;
if (file !== "none") {
  const jpeg = await sharp(file).rotate().resize(400, 400, { fit: "cover" }).flatten({ background: "#ffffff" }).jpeg({ quality: 88 }).toBuffer();
  path = `${workspace.id}/logo-${randomBytes(6).toString("hex")}.jpg`;
  if (r2Enabled()) {
    await r2Put("avatars", path, jpeg, "image/jpeg");
  } else {
    const { error } = await supabase.storage.from("avatars").upload(path, jpeg, { contentType: "image/jpeg" });
    if (error) {
      console.error(`Couldn't store the picture: ${error.message}`);
      process.exit(1);
    }
  }
}

const { error } = await supabase.from("workspaces").update({ logo_path: path }).eq("id", workspace.id);
if (error) {
  console.error(`Couldn't save the logo on ${workspace.name}: ${error.message}`);
  process.exit(1);
}
console.log(path ? `${workspace.name}'s logo is set (${r2Enabled() ? "Cloudflare R2" : "Supabase storage"}: avatars/${path}).` : `${workspace.name} is back to initials.`);
if (workspace.logo_path && workspace.logo_path !== path) console.log(`The previous picture (avatars/${workspace.logo_path}) was left in storage.`);

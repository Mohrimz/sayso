// Copies every file from Supabase Storage to Cloudflare R2, keeping the same
// paths, so the database doesn't change. Safe to run more than once: files
// already in R2 with the same size are skipped.
//
//   node --env-file=.env.local scripts/copy-files-to-r2.mjs              (local)
//   node --env-file=.env.production.local scripts/copy-files-to-r2.mjs   (live site)
//   add --dry-run to only count what would be copied
//
// Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY and the R2_* settings.
// Prints no secrets.
import { createClient } from "@supabase/supabase-js";
import { r2Enabled, r2Put, r2SelfTest, r2Size } from "./r2.mjs";

const BUCKETS = ["content-media", "workspace-files", "chat-files", "avatars"];
const dryRun = process.argv.includes("--dry-run");

if (!r2Enabled()) {
  console.error("R2 isn't configured in this env file (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET).");
  process.exit(1);
}
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are needed.");
  process.exit(1);
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });

if (!(await r2SelfTest().catch((e) => (console.error(String(e)), false)))) {
  console.error("Couldn't write to R2. Check the key has Object Read & Write on the bucket.");
  process.exit(1);
}
console.log("R2 key works.");

/** Every file path in a bucket (Supabase lists one folder at a time). */
async function listAll(bucket, folder = "") {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset });
    if (error) throw new Error(`${bucket}/${folder}: ${error.message}`);
    for (const entry of data ?? []) {
      const path = folder ? `${folder}/${entry.name}` : entry.name;
      if (entry.id === null) out.push(...(await listAll(bucket, path)));
      else if (entry.name !== ".emptyFolderPlaceholder") out.push({ path, size: Number(entry.metadata?.size ?? 0), type: entry.metadata?.mimetype });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

let copied = 0;
let skipped = 0;
let failed = 0;
let bytes = 0;
for (const bucket of BUCKETS) {
  const files = await listAll(bucket).catch((e) => (console.error(String(e)), []));
  console.log(`${bucket}: ${files.length} files`);
  for (const file of files) {
    const existing = await r2Size(bucket, file.path).catch(() => null);
    if (existing !== null && existing === file.size) {
      skipped++;
      continue;
    }
    if (dryRun) {
      copied++;
      bytes += file.size;
      continue;
    }
    const { data, error } = await supabase.storage.from(bucket).download(file.path);
    if (error || !data) {
      console.error(`  couldn't download ${bucket}/${file.path}: ${error?.message}`);
      failed++;
      continue;
    }
    try {
      await r2Put(bucket, file.path, new Uint8Array(await data.arrayBuffer()), file.type || data.type);
      copied++;
      bytes += file.size;
    } catch (e) {
      console.error(`  ${String(e)}`);
      failed++;
    }
  }
}
console.log(
  `${dryRun ? "Would copy" : "Copied"} ${copied} files (${(bytes / 1024 / 1024).toFixed(1)} MB). Already there: ${skipped}. Failed: ${failed}.`,
);
process.exit(failed ? 1 : 0);

// Creates a login to hand to a client before you know their email address,
// e.g. acme@sayso.mohrimz.com. Nothing is ever emailed to these addresses.
// On their first sign-in the client adds their name, job title, phone and
// photo, switches to their own email address and password, and is offered a
// walkthrough.
//
//   node --env-file=.env.local scripts/create-client-login.mjs <client-slug> <name>@sayso.mohrimz.com [approver|viewer]
//   node --env-file=.env.production.local scripts/create-client-login.mjs ...   (live site)
//
// Prints the password once. Send the login and password to the client
// privately; the password is replaced during their first sign-in.
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const PLACEHOLDER_DOMAIN = "sayso.mohrimz.com"; // keep in step with lib/placeholder-email.ts

const [slug, rawEmail, role = "approver"] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
if (!slug || !email) {
  console.error("Usage: node --env-file=<env file> scripts/create-client-login.mjs <client-slug> <name>@sayso.mohrimz.com [approver|viewer]");
  process.exit(1);
}
if (!email.endsWith(`@${PLACEHOLDER_DOMAIN}`)) {
  console.error(`Use an address @${PLACEHOLDER_DOMAIN}. For someone whose email you know, invite them from the client's Team page instead.`);
  process.exit(1);
}
if (!["approver", "viewer"].includes(role)) {
  console.error("The role must be approver or viewer.");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be in the env file.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: workspace } = await supabase.from("workspaces").select("id, name").eq("slug", slug).maybeSingle();
if (!workspace) {
  console.error(`No client with the address name "${slug}".`);
  process.exit(1);
}
const { data: existing } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
if (existing) {
  console.error(`${email} already has an account. Nothing changed.`);
  process.exit(1);
}

// Readable but strong, e.g. "Acm-7Hq2-Xk9P-3vTd".
const chunk = () => randomBytes(9).toString("base64url").replace(/[-_]/g, "").slice(0, 4);
const prefix = workspace.name.replace(/[^A-Za-z]/g, "").slice(0, 3) || "Say";
const password = `${prefix[0].toUpperCase()}${prefix.slice(1).toLowerCase()}-${chunk()}-${chunk()}-${chunk()}`;

const { data: created, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
if (error || !created.user) {
  console.error(`Couldn't create the login: ${error?.message}`);
  process.exit(1);
}
const userId = created.user.id;

// A client with no name yet; their first sign-in asks for it (onboarded_at stays empty).
const { error: profileError } = await supabase
  .from("profiles")
  .update({ side: "client", agency_role: null, full_name: null, onboarded_at: null })
  .eq("id", userId);
const { error: memberError } = profileError
  ? { error: profileError }
  : await supabase.from("workspace_members").insert({ workspace_id: workspace.id, user_id: userId, role });
if (memberError) {
  await supabase.auth.admin.deleteUser(userId);
  console.error(`Couldn't add the login to ${workspace.name}: ${memberError.message}. Nothing was kept.`);
  process.exit(1);
}

console.log(`Created ${email} as ${role === "approver" ? "an approver" : "a viewer"} on ${workspace.name}.`);
console.log(`PASSWORD=${password}`);

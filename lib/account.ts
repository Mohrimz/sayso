import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listFolder, removeFiles } from "@/lib/files";

/**
 * Client workspaces where the viewer is the only approver, so deleting their
 * account would leave nobody who can approve content there. Uses the
 * viewer's own access (row-level security), so it only sees their workspaces.
 */
export async function soleApproverWorkspaces(viewerId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("workspace_members").select("workspace_id").eq("user_id", viewerId).eq("role", "approver");
  const ids = (mine ?? []).map((m) => m.workspace_id);
  if (!ids.length) return [];
  const { data: approvers } = await supabase.from("workspace_members").select("workspace_id, user_id").in("workspace_id", ids).eq("role", "approver");
  const alone = ids.filter((id) => !(approvers ?? []).some((a) => a.workspace_id === id && a.user_id !== viewerId));
  if (!alone.length) return [];
  const { data: workspaces } = await supabase.from("workspaces").select("name").in("id", alone).order("name");
  return (workspaces ?? []).map((w) => w.name);
}

/** True when the viewer is the agency's only admin (they can't delete their account). */
export async function isOnlyAgencyAdmin(viewer: { id: string; side: string; agencyRole: string | null }): Promise<boolean> {
  if (viewer.side !== "agency" || viewer.agencyRole !== "admin") return false;
  const supabase = await createClient();
  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("side", "agency")
    .eq("agency_role", "admin")
    .neq("id", viewer.id);
  return !count;
}

/**
 * Deletes someone's login entirely (and their profile photo). Their past
 * posts, comments and messages stay, shown as "Former member". Callers must
 * check permission first.
 */
export async function deleteLogin(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  await removeFiles("avatars", await listFolder("avatars", userId).catch(() => [])).catch(() => undefined);
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[account] delete login failed", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

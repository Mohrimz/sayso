import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { permissionsFor, type WorkspaceRole } from "@/lib/permissions";
import { asObject, type NotificationPrefs, type Workspace } from "@/lib/types";
import { avatarUrl } from "@/lib/avatar";
import { isPlaceholderEmail } from "@/lib/placeholder-email";

export type Viewer = {
  id: string;
  email: string;
  name: string;
  side: "agency" | "client";
  agencyRole: "admin" | "member" | null;
  prefs: NotificationPrefs;
  jobTitle: string | null;
  phone: string | null;
  /** Path in the avatars bucket, and its public URL. */
  avatarPath: string | null;
  avatarUrl: string | null;
  /** Whether they've typed a name (name falls back to the start of the email). */
  hasName: boolean;
  /** When a client finished their first sign-in setup; null means it's still to do. */
  onboardedAt: string | null;
  /** A login the agency made before knowing their email, e.g. acme@sayso.mohrimz.com. */
  placeholderEmail: boolean;
};

/** The signed-in user and their profile, or null. Cached per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) return null;

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
  if (!profile) return null;

  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name || profile.email.split("@")[0],
    side: profile.side,
    agencyRole: profile.agency_role,
    jobTitle: profile.job_title,
    phone: profile.phone,
    avatarPath: profile.avatar_path,
    avatarUrl: avatarUrl(profile.avatar_path),
    hasName: Boolean(profile.full_name?.trim()),
    onboardedAt: profile.onboarded_at,
    placeholderEmail: isPlaceholderEmail(profile.email),
    prefs: {
      email_approvals: true,
      email_comments: true,
      email_changes: true,
      email_tasks: true,
      email_messages: true,
      email_offers: true,
      ...asObject<Partial<NotificationPrefs>>(profile.notification_prefs),
    },
  };
});

export async function requireViewer(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  return viewer;
}

export async function requireAgency(): Promise<Viewer> {
  const viewer = await requireViewer();
  if (viewer.side !== "agency") redirect("/");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireAgency();
  if (viewer.agencyRole !== "admin") redirect("/dashboard");
  return viewer;
}

export type WorkspaceAccess = {
  viewer: Viewer;
  workspace: Workspace;
  role: WorkspaceRole;
  can: ReturnType<typeof permissionsFor>;
};

/**
 * Loads a workspace the viewer belongs to, with their role in it, or null when
 * they can't see it (row-level security hides other clients' workspaces).
 */
export const findWorkspaceAccess = cache(
  async (by: "slug" | "id", value: string): Promise<WorkspaceAccess | null> => {
    const viewer = await getViewer();
    if (!viewer) return null;
    const supabase = await createClient();

    const { data: workspace } = await supabase.from("workspaces").select("*").eq(by, value).maybeSingle();
    if (!workspace) return null;

    let role: WorkspaceRole;
    if (viewer.side === "agency" && viewer.agencyRole === "admin") {
      role = "admin";
    } else {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspace.id)
        .eq("user_id", viewer.id)
        .maybeSingle();
      if (!member) return null;
      role = member.role;
    }

    return { viewer, workspace, role, can: permissionsFor(role) };
  },
);

/** Page helper: the workspace for a URL slug, or a 404. */
export async function getWorkspaceAccess(slug: string): Promise<WorkspaceAccess> {
  await requireViewer();
  const access = await findWorkspaceAccess("slug", slug);
  if (!access) notFound();
  return access;
}

/** Workspaces the viewer can open, for navigation and the home redirect. */
export const getMyWorkspaces = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workspaces")
    .select("id, slug, name, status")
    .neq("status", "archived")
    .order("name");
  return data ?? [];
});

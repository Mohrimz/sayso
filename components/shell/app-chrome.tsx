import { getMyWorkspaces, getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { WorkspaceRole } from "@/lib/permissions";
import { chatKey } from "@/lib/chat";
import { Logo } from "@/components/logo";
import { Skeleton } from "@/components/ui";
import { Chrome, type ShellWorkspace } from "./chrome";

/**
 * Loads what the navigation needs (the viewer, their workspaces and role in
 * each, counts for the badges) and renders the sidebar, mobile header,
 * drawer and bottom tab bar.
 */
export async function AppChrome() {
  const viewer = await getViewer();
  if (!viewer) return <ChromeSkeleton />;
  const supabase = await createClient();
  const isAdmin = viewer.side === "agency" && viewer.agencyRole === "admin";

  const [workspaces, { data: memberships }, { data: open }, { count: unread }, { data: threads }] = await Promise.all([
    getMyWorkspaces(),
    supabase.from("workspace_members").select("workspace_id, role").eq("user_id", viewer.id),
    supabase
      .from("content_items")
      .select("workspace_id, status, client_decision")
      .in("status", ["client_review", "internal_review", "draft"])
      .or("status.neq.draft,client_decision.eq.changes_requested"),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).is("read_at", null),
    supabase.rpc("chat_threads"),
  ]);
  const chat = Object.fromEntries((threads ?? []).filter((t) => t.unread).map((t) => [chatKey(t.workspace_id, t.channel), t.unread]));

  const roleBy = new Map((memberships ?? []).map((m) => [m.workspace_id, m.role as WorkspaceRole]));
  const shellWorkspaces: ShellWorkspace[] = workspaces
    .map((w): ShellWorkspace | null => {
      const role: WorkspaceRole | undefined = isAdmin ? "admin" : roleBy.get(w.id);
      if (!role) return null;
      const items = (open ?? []).filter((i) => i.workspace_id === w.id);
      return {
        id: w.id,
        slug: w.slug,
        name: w.name,
        status: w.status,
        role,
        awaiting: items.filter((i) => i.status === "client_review").length,
        changes: items.filter((i) => i.status === "draft" && i.client_decision === "changes_requested").length,
        review: items.filter((i) => i.status === "internal_review").length,
      };
    })
    .filter((w): w is ShellWorkspace => w !== null);

  return (
    <Chrome
      data={{
        viewer: { id: viewer.id, name: viewer.name, email: viewer.email, side: viewer.side, isAdmin, avatar: viewer.avatarUrl },
        workspaces: shellWorkspaces,
        unread: unread ?? 0,
        chat,
      }}
    />
  );
}

export function ChromeSkeleton() {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[264px] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="space-y-2 px-3 pt-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-14" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      </aside>
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-line bg-canvas/85 px-4 lg:ml-[264px] lg:px-10">
        <span className="lg:hidden">
          <Logo />
        </span>
      </header>
      <div aria-hidden className="fixed inset-x-0 bottom-0 z-30 border-t border-line/70 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid h-14 max-w-lg grid-cols-5 place-items-center">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-7 w-7 rounded-full" />
          ))}
        </div>
      </div>
    </>
  );
}

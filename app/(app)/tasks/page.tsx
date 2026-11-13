import Link from "next/link";
import type { Metadata } from "next";
import { getSentStatus } from "@/lib/approved-work";
import { requireAgency } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople } from "@/lib/queries";
import { daysAgoIso } from "@/lib/dates";
import { Card, CardHeader } from "@/components/ui";
import { TaskList, type TaskView } from "@/components/task-list";
import { SendWork } from "@/components/task-work";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Team board" };

/** Team board: every task across the clients you can see, grouped by status. */
export default async function TeamBoard({ searchParams }: PageProps<"/tasks">) {
  const viewer = await requireAgency();
  const sp = await searchParams;
  const scope = sp.scope === "mine" ? "mine" : "all";
  const clientFilter = typeof sp.client === "string" ? sp.client : "";
  const reviewId = typeof sp.review === "string" ? sp.review : undefined;
  const isAdmin = viewer.agencyRole === "admin";
  const supabase = await createClient();

  const { data: workspaces } = await supabase.from("workspaces").select("id, slug, name, time_zone").neq("status", "archived").order("name");
  const wsById = new Map((workspaces ?? []).map((w) => [w.id, w]));

  let query = supabase.from("tasks").select("*").order("due_date", { ascending: true, nullsFirst: false }).limit(300);
  if (scope === "mine") query = query.eq("owner_id", viewer.id);
  const selected = (workspaces ?? []).find((w) => w.slug === clientFilter);
  if (selected) query = query.eq("workspace_id", selected.id);
  const since = daysAgoIso(14);
  const { data } = await query;
  const tasks = (data ?? []).filter((t) => t.status !== "done" || (t.completed_at ?? t.updated_at) >= since);
  const [people, { data: rounds }] = await Promise.all([
    getPeople(tasks.map((t) => t.owner_id)),
    tasks.length
      ? supabase
          .from("task_submissions")
          .select("task_id, decision, review_note, submitted_at, content_item_id, reviewed_at, submitted_by")
          .in(
            "task_id",
            tasks.map((t) => t.id),
          )
          .order("submitted_at", { ascending: false })
      : Promise.resolve({
          data: [] as {
            task_id: string;
            decision: string | null;
            review_note: string | null;
            content_item_id: string | null;
            reviewed_at: string | null;
            submitted_by: string | null;
          }[],
        }),
  ]);
  // Approved work: whether it has gone to the client yet.
  const sentStatus = await getSentStatus(supabase, rounds ?? []);
  // The latest round of submitted work for each task.
  const lastReview = new Map<string, { decision: string | null; note: string | null }>();
  for (const r of rounds ?? []) if (!lastReview.has(r.task_id)) lastReview.set(r.task_id, { decision: r.decision, note: r.review_note });

  const view = (t: (typeof tasks)[number]): TaskView => ({
    ...t,
    ownerName: t.owner_id ? people.get(t.owner_id)?.name : null,
    workspaceName: wsById.get(t.workspace_id)?.name,
    workspaceSlug: wsById.get(t.workspace_id)?.slug,
    lastReview: lastReview.get(t.id) ?? null,
    sentStatus: (() => {
      const st = sentStatus.get(t.id);
      const ws = wsById.get(t.workspace_id);
      return st && ws ? { href: `/w/${ws.slug}/content/${st.postId}`, senderId: st.senderId, sent: st.sent } : null;
    })(),
  });
  const columns = [
    { key: "todo", title: "To do" },
    { key: "in_progress", title: "In progress" },
    // Admins see work waiting on them as "Submitted work"; the team sees it as "In review".
    { key: "in_review", title: isAdmin ? "Submitted work" : "In review" },
    { key: "done", title: "Done (last 14 days)" },
  ] as const;

  const href = (next: { scope?: string; client?: string }) => {
    const params = new URLSearchParams();
    const s = next.scope ?? scope;
    const c = next.client ?? clientFilter;
    if (s === "mine") params.set("scope", "mine");
    if (c) params.set("client", c);
    const q = params.toString();
    return q ? `/tasks?${q}` : "/tasks";
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Team board</h1>
          <p className="mt-1 text-sm text-muted">
            {isAdmin
              ? "Tasks across all clients, grouped by status. Add tasks from a client's Tasks tab."
              : "Tasks across your clients, grouped by status. Made something without a task? Use Send work."}
          </p>
        </div>
        {/* Team members can send work for review without a task on the board. */}
        {!isAdmin ? <SendWork clients={(workspaces ?? []).map((w) => ({ id: w.id, name: w.name }))} /> : null}
        <div className="flex flex-wrap gap-2 text-[13px]">
          <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5">
            {(["all", "mine"] as const).map((s) => (
              <Link
                key={s}
                href={href({ scope: s })}
                className={cn("rounded-md px-2.5 py-1", scope === s ? "bg-surface font-medium shadow-sm" : "text-muted")}
              >
                {s === "all" ? "Everyone" : "Mine"}
              </Link>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            <Link
              href={href({ client: "" })}
              className={cn("rounded-full border px-2.5 py-1", !selected ? "border-ink bg-ink text-white" : "border-line-strong text-ink-soft")}
            >
              All clients
            </Link>
            {(workspaces ?? []).map((w) => (
              <Link
                key={w.id}
                href={href({ client: w.slug })}
                className={cn(
                  "rounded-full border px-2.5 py-1",
                  selected?.id === w.id ? "border-ink bg-ink text-white" : "border-line-strong text-ink-soft",
                )}
              >
                {w.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.key).map(view);
          return (
            <Card key={col.key}>
              <CardHeader title={`${col.title} · ${colTasks.length}`} />
              <TaskList
                tasks={colTasks}
                tz="UTC"
                canEdit
                // Agency tasks are marked done by an admin; anyone on the team can tick a client's task.
                canTick={(t) => t.owner_side === "client" || isAdmin}
                viewer={{ id: viewer.id, isAgency: true, isAdmin }}
                reviewId={reviewId}
                showWorkspace
                empty="Nothing here."
              />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

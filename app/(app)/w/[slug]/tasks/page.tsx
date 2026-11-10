import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgencyAssignees, getPeople, getWorkspaceMembers } from "@/lib/queries";
import { Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaughtUp } from "@/components/anim";
import { Sheet } from "@/components/sheet";
import { Tabs, TabsContent } from "@/components/tabs";
import { TaskList, type TaskView } from "@/components/task-list";
import { createTask } from "@/app/actions/tasks";

export default async function WorkspaceTasks({ params }: PageProps<"/w/[slug]/tasks">) {
  const { slug } = await params;
  const { workspace, can, viewer } = await getWorkspaceAccess(slug);
  const supabase = await createClient();
  const tz = workspace.time_zone;

  const [{ data }, members, assignees] = await Promise.all([
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspace.id)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    getWorkspaceMembers(workspace.id),
    can.isAgency ? getAgencyAssignees(workspace.id) : Promise.resolve([]),
  ]);
  const tasks = data ?? [];
  const isAdmin = viewer.agencyRole === "admin";
  const [people, { data: rounds }] = await Promise.all([
    getPeople(tasks.map((t) => t.owner_id)),
    can.isAgency && tasks.length
      ? supabase
          .from("task_submissions")
          .select("task_id, decision, review_note, submitted_at")
          .in("task_id", tasks.map((t) => t.id))
          .order("submitted_at", { ascending: false })
      : Promise.resolve({ data: [] as { task_id: string; decision: string | null; review_note: string | null }[] }),
  ]);
  // The latest round of submitted work for each task (agency only).
  const lastReview = new Map<string, { decision: string | null; note: string | null }>();
  for (const r of rounds ?? []) if (!lastReview.has(r.task_id)) lastReview.set(r.task_id, { decision: r.decision, note: r.review_note });
  const view = (t: (typeof tasks)[number]): TaskView => ({
    ...t,
    ownerName: t.owner_id ? people.get(t.owner_id)?.name : null,
    lastReview: lastReview.get(t.id) ?? null,
  });
  const taskViewer = { id: viewer.id, isAgency: can.isAgency, isAdmin: can.isAgency && isAdmin };

  const clientOpen = tasks.filter((t) => t.owner_side === "client" && t.status !== "done").map(view);
  const agencyOpen = tasks.filter((t) => t.owner_side === "agency" && t.status !== "done").map(view);
  const done = tasks.filter((t) => t.status === "done").slice(0, 20).map(view);
  const clientMembers = members.filter((m) => m.role !== "team_member");

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{can.isAgency ? "Tasks" : "Action items"}</h1>
          <p className="mt-1 text-sm text-muted">
            {can.isAgency ? "Work that isn't a post, and anything waiting on the client." : "Things the team needs from you."}
          </p>
        </div>
        {can.managePlans ? (
          <Sheet title="Add a task" triggerLabel="Add task" icon="plus" triggerVariant="primary">
            <ActionForm action={createTask} className="space-y-4">
              <input type="hidden" name="workspace_id" value={workspace.id} />
              <div>
                <label className="label" htmlFor="task-title">What needs doing?</label>
                <input id="task-title" name="title" required className="field" placeholder="e.g. Update Facebook bio" />
              </div>
              <div>
                <label className="label" htmlFor="task-desc">Details (optional)</label>
                <textarea id="task-desc" name="description" rows={3} className="field" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="task-owner">Who does it?</label>
                  <select id="task-owner" name="owner" className="field" defaultValue={`agency:${viewer.id}`}>
                    <optgroup label="Agency">
                      {assignees.map((a) => (
                        <option key={a.id} value={`agency:${a.id}`}>{a.name}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Client">
                      <option value="client:">Any approver</option>
                      {clientMembers.map((m) => (
                        <option key={m.id} value={`client:${m.id}`}>{m.name}</option>
                      ))}
                    </optgroup>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="task-due">Due date</label>
                  <input id="task-due" type="date" name="due_date" className="field" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" name="internal" className="size-4 rounded border-line-strong" />
                Hide from the client
              </label>
              <SubmitButton pendingLabel="Adding…">Add task</SubmitButton>
            </ActionForm>
          </Sheet>
        ) : null}
      </div>

      <Tabs
        tabs={[
          { value: "client", label: can.isAgency ? "Waiting on client" : "For you", count: clientOpen.length },
          { value: "agency", label: can.isAgency ? "Agency" : "Team is working on", count: agencyOpen.length },
          { value: "done", label: "Done" },
        ]}
      >
        <TabsContent value="client">
          <Card>
            {clientOpen.length ? (
              <TaskList tasks={clientOpen} tz={tz} canEdit={can.managePlans} canTick={() => true} viewer={taskViewer} />
            ) : (
              <CaughtUp title={can.isAgency ? "Nothing waiting on the client" : "Nothing needed from you"} />
            )}
          </Card>
        </TabsContent>
        <TabsContent value="agency">
          <Card>
            {agencyOpen.length ? (
              <TaskList tasks={agencyOpen} tz={tz} canEdit={can.managePlans} canTick={() => taskViewer.isAdmin} viewer={taskViewer} />
            ) : (
              <CaughtUp title="No open tasks" />
            )}
          </Card>
        </TabsContent>
        <TabsContent value="done">
          <Card>
            {done.length ? (
              <TaskList
                tasks={done}
                tz={tz}
                canEdit={can.managePlans}
                canTick={(t) => t.owner_side === "client" || taskViewer.isAdmin}
                viewer={taskViewer}
              />
            ) : (
              <CaughtUp title="Nothing completed yet" />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

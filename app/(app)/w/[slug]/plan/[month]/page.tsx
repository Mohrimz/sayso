import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, EyeOff, Plus } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getPlanByMonth, getThumbnails } from "@/lib/queries";
import { formatDay, isMonthParam, monthLabel, shiftMonth, timeAgo } from "@/lib/dates";
import { asArray, asObject, type KeyDate, type Quotas } from "@/lib/types";
import { Avatar, Badge, ButtonLink, Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaughtUp, Stagger, StaggerItem } from "@/components/anim";
import { MonthProgress } from "@/components/month-progress";
import { PlanMenu } from "@/components/plan-menu";
import { Sheet } from "@/components/sheet";
import { Tabs, TabsContent } from "@/components/tabs";
import { ContentRow } from "@/components/content-card";
import { Timeline } from "@/components/timeline";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { createPlan, deleteProgressUpdate, postProgressUpdate, setPlanStatus, updatePlan } from "@/app/actions/plans";

export default async function PlanPage({ params, searchParams }: PageProps<"/w/[slug]/plan/[month]">) {
  const [{ slug, month }, sp] = await Promise.all([params, searchParams]);
  if (!isMonthParam(month)) notFound();
  const { workspace, can } = await getWorkspaceAccess(slug);
  const supabase = await createClient();
  const tz = workspace.time_zone;
  const base = `/w/${workspace.slug}`;
  const side = can.isAgency ? "agency" : "client";
  const view = sp.view === "list" ? "list" : "calendar";
  const plan = await getPlanByMonth(workspace.id, month);

  const header = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        <Link href={`${base}/plan/${shiftMonth(month, -1)}`} className="rounded-lg p-1.5 text-muted transition hover:bg-sunken hover:text-ink" aria-label="Previous month">
          <ChevronLeft className="size-5" aria-hidden />
        </Link>
        <h1 className="px-1 text-xl font-semibold tracking-tight whitespace-nowrap sm:text-2xl">{monthLabel(month)}</h1>
        <Link href={`${base}/plan/${shiftMonth(month, 1)}`} className="rounded-lg p-1.5 text-muted transition hover:bg-sunken hover:text-ink" aria-label="Next month">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
        {plan && can.isAgency && plan.status === "closed" ? <Badge className="ml-1">Closed</Badge> : null}
      </div>
      {plan && can.managePlans ? (
        <div className="flex items-center gap-2">
          <ButtonLink href={`${base}/content/new?month=${month}`} variant="primary" size="sm">
            <Plus className="size-4" aria-hidden /> Add content
          </ButtonLink>
          <PlanMenu planId={plan.id} status={plan.status} canShare={can.sharePlan} />
        </div>
      ) : null}
    </div>
  );

  if (!plan) {
    return (
      <div>
        {header}
        <Card>
          {can.managePlans ? (
            <CaughtUp art="calendar" title={`No plan for ${monthLabel(month)} yet`}>
              <ActionForm action={createPlan} className="mt-3">
                <input type="hidden" name="workspace_id" value={workspace.id} />
                <input type="hidden" name="month" value={month} />
                <SubmitButton size="sm" pendingLabel="Creating…">
                  Create plan
                </SubmitButton>
              </ActionForm>
            </CaughtUp>
          ) : (
            <CaughtUp art="calendar" title="This plan isn't ready yet">Your agency will share it here once it&apos;s ready.</CaughtUp>
          )}
        </Card>
      </div>
    );
  }

  const [itemsRes, updatesRes] = await Promise.all([
    supabase
      .from("content_items")
      .select("id, title, type, status, client_decision, planned_at, approval_deadline")
      .eq("plan_id", plan.id)
      .order("planned_at", { ascending: true, nullsFirst: false }),
    supabase.from("progress_updates").select("*").eq("plan_id", plan.id).order("created_at", { ascending: false }),
  ]);
  const items = itemsRes.data ?? [];
  const updates = updatesRes.data ?? [];
  const [people, thumbs] = await Promise.all([getPeople(updates.map((u) => u.author_id)), getThumbnails(items.map((i) => i.id))]);
  const keyDates = asArray<KeyDate>(plan.key_dates);
  // The month's posts by stage (published ones are counted under Progress).
  const stages = [
    { key: "ready", title: "Ready", description: "Approved by the client, waiting to go out.", items: items.filter((i) => i.status === "approved" || i.status === "scheduled") },
    {
      key: "approval",
      title: "Needs approval",
      description: can.isAgency ? "With the client now." : "Waiting for your approvers.",
      items: items.filter((i) => i.status === "client_review"),
    },
    {
      key: "progress",
      title: "In progress",
      description: can.isAgency ? "Planned, in draft or in internal review." : "The team is still working on these.",
      items: items.filter((i) => ["planned", "draft", "internal_review"].includes(i.status)),
    },
  ];

  return (
    <div>
      <RealtimeRefresh channel={`plan:${plan.id}`} watch={[{ table: "content_items", filter: `plan_id=eq.${plan.id}` }]} />
      {header}

      {can.isAgency && plan.status === "draft" ? (
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm text-amber-900">
            <EyeOff className="size-4 shrink-0" aria-hidden />
            {can.sharePlan ? "The client can't see this month yet." : "The client can't see this month yet. An admin shares it when it's ready."}
          </p>
          {can.sharePlan ? (
            <ActionForm action={setPlanStatus}>
              <input type="hidden" name="plan_id" value={plan.id} />
              <input type="hidden" name="status" value="active" />
              <SubmitButton size="sm" pendingLabel="Sharing…">
                Share with client
              </SubmitButton>
            </ActionForm>
          ) : null}
        </div>
      ) : null}

      <Tabs
        tabs={[
          { value: "calendar", label: "Calendar", count: items.length },
          { value: "overview", label: "Overview" },
          { value: "updates", label: "Updates", count: updates.length },
        ]}
      >
        <TabsContent value="calendar">
          <Timeline
            month={month}
            items={items}
            keyDates={keyDates}
            tz={tz}
            side={side}
            basePath={base}
            view={view}
            viewHrefs={{ calendar: `${base}/plan/${month}`, list: `${base}/plan/${month}?view=list` }}
            thumbs={thumbs}
          />
        </TabsContent>

        <TabsContent value="overview">
          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-4 sm:p-5">
              <h2 className="mb-4 text-[15px] font-semibold">Progress</h2>
              <MonthProgress items={items} quotas={asObject<Quotas>(workspace.quotas)} />
            </Card>
            <Card className="p-4 sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold">Themes and goals</h2>
                {can.managePlans ? (
                  <Sheet title="Edit this month" triggerLabel="Edit" icon="pencil" triggerVariant="ghost">
                    <ActionForm action={updatePlan} className="space-y-4">
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <div>
                        <label className="label" htmlFor="themes">Themes</label>
                        <textarea id="themes" name="themes" rows={4} defaultValue={plan.themes ?? ""} className="field" />
                      </div>
                      <div>
                        <label className="label" htmlFor="goals">Goals</label>
                        <textarea id="goals" name="goals" rows={3} defaultValue={plan.goals ?? ""} className="field" />
                      </div>
                      <div>
                        <label className="label" htmlFor="key_dates">Key dates</label>
                        <textarea
                          id="key_dates"
                          name="key_dates"
                          rows={5}
                          defaultValue={keyDates.map((d) => `${d.date} ${d.label}`).join("\n")}
                          className="field font-mono text-[13px]"
                          placeholder={"2026-11-27 Black Friday\n2026-12-01 Holiday pre-orders open"}
                        />
                        <p className="hint">One per line: the date, then what it is.</p>
                      </div>
                      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
                    </ActionForm>
                  </Sheet>
                ) : null}
              </div>
              {plan.themes ? <p className="text-sm leading-relaxed whitespace-pre-line text-ink-soft">{plan.themes}</p> : null}
              {plan.goals ? <p className="mt-3 text-sm leading-relaxed whitespace-pre-line text-ink-soft">{plan.goals}</p> : null}
              {!plan.themes && !plan.goals ? <p className="text-sm text-muted">Nothing written yet.</p> : null}
              {keyDates.length ? (
                <>
                  <h3 className="mt-5 mb-2 text-[13px] font-semibold text-ink">Key dates</h3>
                  <ul className="space-y-1.5">
                    {keyDates.map((d) => (
                      <li key={d.date + d.label} className="flex items-center gap-2.5 text-sm">
                        <CalendarClock className="size-4 shrink-0 text-amber-700" aria-hidden />
                        <span className="w-24 shrink-0 text-muted tabular-nums">{formatDay(d.date)}</span>
                        <span className="text-ink">{d.label}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Card>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            {stages.map((stage) => (
              <Card key={stage.key} className="overflow-hidden">
                <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-5">
                  <div>
                    <h2 className="text-[15px] font-semibold">{stage.title}</h2>
                    <p className="mt-0.5 text-[13px] text-muted">{stage.description}</p>
                  </div>
                  <span className="text-lg leading-none font-semibold tabular-nums text-ink">{stage.items.length}</span>
                </div>
                {stage.items.length ? (
                  <ul className="divide-y divide-line">
                    {stage.items.map((i) => (
                      <li key={i.id}>
                        <ContentRow item={i} href={`${base}/content/${i.id}`} tz={tz} side={side} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-5 text-sm text-muted sm:px-5">None right now.</p>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <Card>
            {can.managePlans ? (
              <ActionForm action={postProgressUpdate} resetOnSuccess className="border-b border-line p-4 sm:p-5">
                <input type="hidden" name="plan_id" value={plan.id} />
                <textarea name="body" rows={2} required className="field" placeholder="Share a quick update with the client…" aria-label="Progress update" />
                <div className="mt-2 flex justify-end">
                  <SubmitButton size="sm" pendingLabel="Posting…">Post update</SubmitButton>
                </div>
              </ActionForm>
            ) : null}
            {updates.length ? (
              <Stagger as="ol" className="divide-y divide-line">
                {updates.map((u) => {
                  const author = people.get(u.author_id ?? "")?.name ?? "Agency";
                  return (
                    <StaggerItem as="li" key={u.id} className="flex gap-3 px-4 py-3.5 sm:px-5">
                      <Avatar name={author} size="sm" className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm whitespace-pre-line text-ink-soft">{u.body}</p>
                        <p className="mt-1 text-xs text-muted">
                          {author} · {timeAgo(u.created_at)}
                        </p>
                      </div>
                      {can.managePlans ? (
                        <form action={deleteProgressUpdate}>
                          <input type="hidden" name="id" value={u.id} />
                          <button type="submit" className="text-xs text-faint hover:text-danger">Delete</button>
                        </form>
                      ) : null}
                    </StaggerItem>
                  );
                })}
              </Stagger>
            ) : (
              <CaughtUp art="envelope" title="No updates yet" />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

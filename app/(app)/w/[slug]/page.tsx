import Link from "next/link";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getPeople, getPlanByMonth, getThumbnails } from "@/lib/queries";
import { currentMonth, monthLabel, timeAgo } from "@/lib/dates";
import { asObject, type Quotas } from "@/lib/types";
import { Avatar, ButtonLink, Card, CardHeader } from "@/components/ui";
import { ApprovalCard, ContentRow } from "@/components/content-card";
import { CaughtUp, Stagger, StaggerItem } from "@/components/anim";
import { MonthProgress } from "@/components/month-progress";
import { TaskList } from "@/components/task-list";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { OffersSummary } from "@/components/offers/offers-summary";
import { getOffers } from "@/lib/offers-data";
import { recentOfferSince } from "@/lib/offers";

export default async function WorkspaceHome({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const { workspace, viewer, can } = await getWorkspaceAccess(slug);
  const supabase = await createClient();
  const tz = workspace.time_zone;
  const month = currentMonth(tz);
  const side = can.isAgency ? "agency" : "client";
  const base = `/w/${workspace.slug}`;
  const select = "id, title, type, status, client_decision, planned_at, approval_deadline";

  const plan = await getPlanByMonth(workspace.id, month);
  const [planItemsRes, awaitingRes, teamRes, tasksRes, updatesRes, commentsRes] = await Promise.all([
    plan ? supabase.from("content_items").select("type, status").eq("plan_id", plan.id) : Promise.resolve({ data: [] }),
    supabase.from("content_items").select(select).eq("workspace_id", workspace.id).eq("status", "client_review").order("approval_deadline"),
    can.isAgency
      ? supabase
          .from("content_items")
          .select(select)
          .eq("workspace_id", workspace.id)
          .in("status", ["draft", "internal_review"])
          .or("status.eq.internal_review,client_decision.eq.changes_requested")
          .order("planned_at")
      : Promise.resolve({ data: [] }),
    supabase
      .from("tasks")
      .select("*")
      .eq("workspace_id", workspace.id)
      .neq("status", "done")
      .eq("owner_side", can.isAgency ? "agency" : "client")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(6),
    plan ? supabase.from("progress_updates").select("*").eq("plan_id", plan.id).order("created_at", { ascending: false }).limit(2) : Promise.resolve({ data: [] }),
    supabase
      .from("comments")
      .select("id, body, created_at, author_id, content_item_id, kind")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const awaiting = awaitingRes.data ?? [];
  const team = teamRes.data ?? [];
  const tasks = tasksRes.data ?? [];
  const updates = updatesRes.data ?? [];
  const comments = commentsRes.data ?? [];
  const [thumbs, people, offers] = await Promise.all([
    getThumbnails(awaiting.map((i) => i.id)),
    getPeople([...updates.map((u) => u.author_id), ...comments.map((c) => c.author_id), ...tasks.map((t) => t.owner_id)]),
    // Offers the client shared in the last month (a short list; the Offers page has the rest).
    getOffers(workspace, viewer, { since: recentOfferSince(), limit: 20 }),
  ]);
  const offerRows = offers.slice(0, 3).map((o) => ({ id: o.id, message: o.message, createdAt: o.createdAt, href: `${base}/offers#offer-${o.id}` }));
  const name = (id: string | null) => (id ? (people.get(id)?.name ?? "Someone") : "Someone");

  const feed = [
    ...updates.map((u) => ({ id: u.id, at: u.created_at, who: name(u.author_id), text: u.body, href: `${base}/plan/${month}`, verb: "posted an update" })),
    ...comments.map((c) => ({
      id: c.id,
      at: c.created_at,
      who: name(c.author_id),
      text: c.body,
      href: `${base}/content/${c.content_item_id}`,
      verb: c.kind === "change_request" ? "asked for changes" : "commented",
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 4);

  const approvalCards = (
    <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {awaiting.map((item) => (
        <StaggerItem key={item.id}>
          <ApprovalCard item={item} media={thumbs.get(item.id)} href={`${base}/content/${item.id}`} tz={tz} side={side} />
        </StaggerItem>
      ))}
    </Stagger>
  );

  return (
    <div className="space-y-6">
      <RealtimeRefresh
        channel={`ws-home:${workspace.id}`}
        watch={[
          { table: "content_items", filter: `workspace_id=eq.${workspace.id}` },
          { table: "comments", filter: `workspace_id=eq.${workspace.id}` },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight sm:text-[30px]">
            {can.isAgency ? (
              workspace.name
            ) : (
              <>
                Hi <span className="text-gradient">{viewer.name.split(" ")[0]}</span>
              </>
            )}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {can.isAgency
              ? `${awaiting.length} with the client · ${team.length} for the team`
              : awaiting.length
                ? `${awaiting.length} ${awaiting.length === 1 ? "post is" : "posts are"} ready for ${can.approve ? "your" : "your team's"} approval.`
                : "You're all caught up."}
          </p>
        </div>
        {can.isAgency ? (
          <div className="flex gap-2">
            <ButtonLink href={`${base}/plan/${month}`} size="sm">
              <CalendarDays className="size-4" aria-hidden /> Plan
            </ButtonLink>
            <ButtonLink href={`${base}/content/new?month=${month}`} variant="primary" size="sm">
              <Plus className="size-4" aria-hidden /> Add content
            </ButtonLink>
          </div>
        ) : null}
      </div>

      {can.isClient ? (
        <section aria-labelledby="approve-heading">
          <h2 id="approve-heading" className="mb-3 text-base font-semibold">
            {can.approve ? "Needs your approval" : "Waiting for approval"}
          </h2>
          {awaiting.length ? (
            approvalCards
          ) : (
            <Card>
              <CaughtUp title="Nothing to approve">We&apos;ll email you when new posts are ready.</CaughtUp>
            </Card>
          )}
        </section>
      ) : (
        <>
          <Card>
            <CardHeader title="For the team" />
            {team.length ? (
              <Stagger className="divide-y divide-line">
                {team.map((item) => (
                  <StaggerItem key={item.id}>
                    <ContentRow item={item} href={`${base}/content/${item.id}`} tz={tz} side="agency" />
                  </StaggerItem>
                ))}
              </Stagger>
            ) : (
              <CaughtUp title="No changes or reviews waiting" />
            )}
          </Card>
          {awaiting.length ? (
            <section>
              <h2 className="mb-3 text-base font-semibold">With the client</h2>
              {approvalCards}
            </section>
          ) : null}
        </>
      )}

      <OffersSummary rows={offerRows} allHref={`${base}/offers`} more={Math.max(0, offers.length - offerRows.length)} />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader
            title={`This month · ${monthLabel(month)}`}
            action={
              <ButtonLink href={`${base}/plan/${month}`} size="sm" variant="ghost">
                Open plan <ArrowRight className="size-3.5" aria-hidden />
              </ButtonLink>
            }
          />
          <div className="p-4 sm:p-5">
            {plan && (can.isAgency || plan.status !== "draft") ? (
              <MonthProgress items={planItemsRes.data ?? []} quotas={asObject<Quotas>(workspace.quotas)} />
            ) : (
              <p className="text-sm text-muted">
                {can.isAgency ? "No plan for this month yet. Open the plan to create it." : "This month's plan is on its way."}
              </p>
            )}
          </div>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title={can.isAgency ? "Open tasks" : "Waiting on you"}
            action={
              <ButtonLink href={`${base}/tasks`} size="sm" variant="ghost">
                All <ArrowRight className="size-3.5" aria-hidden />
              </ButtonLink>
            }
          />
          {tasks.length ? (
            <TaskList
              tasks={tasks.map((t) => ({ ...t, ownerName: t.owner_id ? people.get(t.owner_id)?.name : null }))}
              tz={tz}
              canEdit={false}
              // Agency tasks are marked done by an admin (after review); client to-dos can be ticked here.
              canTick={(t) => t.owner_side === "client" || viewer.agencyRole === "admin"}
              viewer={{ id: viewer.id, isAgency: can.isAgency, isAdmin: can.isAgency && viewer.agencyRole === "admin" }}
            />
          ) : (
            <CaughtUp title={can.isAgency ? "No open tasks" : "Nothing needed from you"} />
          )}
        </Card>
      </div>

      {feed.length ? (
        <Card>
          <CardHeader title="Latest" />
          <Stagger as="ul" className="divide-y divide-line">
            {feed.map((f) => (
              <StaggerItem as="li" key={f.id}>
                <Link href={f.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5">
                  <Avatar name={f.who} size="sm" className="mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-xs text-muted">
                      <span className="font-medium text-ink-soft">{f.who}</span> {f.verb} · {timeAgo(f.at)}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-sm text-ink-soft">{f.text}</span>
                  </span>
                </Link>
              </StaggerItem>
            ))}
          </Stagger>
        </Card>
      ) : null}
    </div>
  );
}

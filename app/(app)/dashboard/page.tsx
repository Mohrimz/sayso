import Link from "next/link";
import type { Metadata } from "next";
import { CalendarClock, CircleCheckBig, Inbox, ListTodo, Plus, Send } from "lucide-react";
import { requireAgency } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { currentMonth, formatDate, formatDateTime } from "@/lib/dates";
import { deliverables } from "@/lib/content";
import { asObject, type Quotas } from "@/lib/types";
import { Avatar, Badge, ButtonLink, Card, CardHeader } from "@/components/ui";
import { AnimatedBar, AnimatedNumber, CaughtUp, Stagger, StaggerItem } from "@/components/anim";
import { StatusBadge } from "@/components/status-badge";
import { TypeIcon } from "@/components/type-icon";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { OffersSummary } from "@/components/offers/offers-summary";
import { recentOfferSince } from "@/lib/offers";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const viewer = await requireAgency();
  const supabase = await createClient();
  const isAdmin = viewer.agencyRole === "admin";

  const { data: workspaces } = await supabase.from("workspaces").select("*").neq("status", "archived").order("name");
  const list = workspaces ?? [];
  const ids = list.map((w) => w.id);
  const months = [...new Set(list.map((w) => `${currentMonth(w.time_zone)}-01`))];

  const [plansRes, openItemsRes, myTasksRes, offersRes] = await Promise.all([
    ids.length ? supabase.from("monthly_plans").select("id, workspace_id, month, status").in("workspace_id", ids).in("month", months) : Promise.resolve({ data: [] }),
    ids.length
      ? supabase
          .from("content_items")
          .select("id, workspace_id, title, type, status, client_decision, planned_at, approval_deadline, assignee_id, reviewer_id")
          .in("workspace_id", ids)
          .neq("status", "published")
          .order("planned_at", { ascending: true })
      : Promise.resolve({ data: [] }),
    supabase
      .from("tasks")
      .select("id, title, due_date, workspace_id")
      .eq("owner_side", "agency")
      .eq("owner_id", viewer.id)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    ids.length
      ? supabase
          .from("offers")
          .select("id, workspace_id, message, created_at")
          .in("workspace_id", ids)
          .gte("created_at", recentOfferSince())
          .order("created_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
  ]);

  const plans = (plansRes.data ?? []).filter((p) => {
    const ws = list.find((w) => w.id === p.workspace_id);
    return ws && p.month === `${currentMonth(ws.time_zone)}-01`;
  });
  const planIds = plans.map((p) => p.id);
  const { data: monthItems } = planIds.length
    ? await supabase.from("content_items").select("plan_id, type, status").in("plan_id", planIds)
    : { data: [] };

  const open = openItemsRes.data ?? [];
  const wsById = new Map(list.map((w) => [w.id, w]));
  const now = new Date().toISOString();

  const changes = open.filter((i) => i.status === "draft" && i.client_decision === "changes_requested");
  // Only agency admins review posts and send them to the client.
  const review = isAdmin ? open.filter((i) => i.status === "internal_review" && (!i.reviewer_id || i.reviewer_id === viewer.id)) : [];
  const mine = open.filter((i) => i.assignee_id === viewer.id && ["planned", "draft"].includes(i.status) && i.client_decision !== "changes_requested");
  const awaiting = open.filter((i) => i.status === "client_review");
  const overdue = awaiting.filter((i) => i.approval_deadline && i.approval_deadline < now);
  const attention = [...changes, ...review, ...overdue, ...mine].slice(0, 12);
  const publishedThisMonth = (monthItems ?? []).filter((i) => i.status === "published").length;
  const myTasks = myTasksRes.data ?? [];
  // Offers clients shared in the last month, newest first.
  const offers = (offersRes.data ?? []).flatMap((o) => {
    const ws = wsById.get(o.workspace_id);
    return ws ? [{ id: o.id, message: o.message, createdAt: o.created_at, client: ws.name, href: `/w/${ws.slug}/offers#offer-${o.id}` }] : [];
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-6">
      <RealtimeRefresh channel="dashboard" watch={[{ table: "content_items" }]} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight sm:text-[30px]">
            {greeting}, <span className="text-gradient">{viewer.name.split(" ")[0]}</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            {attention.length ? `${attention.length} ${attention.length === 1 ? "thing needs" : "things need"} your attention.` : "Nothing needs you right now."}
          </p>
        </div>
        {isAdmin ? (
          <ButtonLink href="/clients/new" variant="primary">
            <Plus className="size-4" aria-hidden /> New client
          </ButtonLink>
        ) : null}
      </div>

      <Stagger className="grid grid-cols-3 gap-3">
        {[
          { label: "To do", value: attention.length, icon: Inbox, tint: "bg-accent-soft text-accent" },
          { label: "With clients", value: awaiting.length, icon: Send, tint: "bg-blue-50 text-blue-700" },
          { label: "Published", value: publishedThisMonth, icon: CircleCheckBig, tint: "bg-emerald-50 text-emerald-700", sub: "this month" },
        ].map((s) => (
          <StaggerItem key={s.label}>
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${s.tint}`}>
                <s.icon className="size-5" aria-hidden />
              </span>
              <span>
                <AnimatedNumber value={s.value} className="block text-2xl leading-none font-semibold" />
                <span className="mt-1 block text-[13px] text-muted">
                  {s.label}
                  {s.sub ? <span className="hidden sm:inline"> {s.sub}</span> : null}
                </span>
              </span>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      <Card>
        <CardHeader title="Needs your attention" />
        {attention.length || myTasks.length ? (
          <Stagger as="ul" className="divide-y divide-line">
            {attention.map((i) => {
              const ws = wsById.get(i.workspace_id)!;
              const isOverdue = i.status === "client_review";
              return (
                <StaggerItem as="li" key={i.id}>
                  <Link href={`/w/${ws.slug}/content/${i.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
                      <TypeIcon type={i.type} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{i.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {ws.name} · {isOverdue ? `approval overdue since ${formatDate(i.approval_deadline, ws.time_zone)}` : formatDateTime(i.planned_at, ws.time_zone)}
                      </span>
                    </span>
                    {isOverdue ? <Badge tone="orange">Overdue</Badge> : <StatusBadge item={i} side="agency" />}
                  </Link>
                </StaggerItem>
              );
            })}
            {myTasks.map((t) => {
              const ws = wsById.get(t.workspace_id);
              return (
                <StaggerItem as="li" key={t.id}>
                  <Link href={`/w/${ws?.slug}/tasks`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted">
                      <ListTodo className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{t.title}</span>
                      <span className="block truncate text-xs text-muted">
                        {ws?.name} · Task{t.due_date ? ` · due ${formatDate(t.due_date)}` : ""}
                      </span>
                    </span>
                    <CalendarClock className="size-4 text-faint" aria-hidden />
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        ) : (
          <CaughtUp title="You're all caught up">New change requests and reviews will show up here.</CaughtUp>
        )}
      </Card>

      <OffersSummary title="Client offers" rows={offers.slice(0, 6)} />

      <Card>
        <CardHeader title="Clients" />
        {list.length ? (
          <Stagger as="ul" className="divide-y divide-line">
            {list.map((w) => {
              const plan = plans.find((p) => p.workspace_id === w.id);
              const items = (monthItems ?? []).filter((i) => i.plan_id === plan?.id);
              const rows = deliverables(items, asObject<Quotas>(w.quotas));
              const quota = rows.reduce((n, r) => n + r.quota, 0) || 1;
              const published = rows.reduce((n, r) => n + r.published, 0);
              const ready = rows.reduce((n, r) => n + r.ready, 0);
              const wsAwaiting = awaiting.filter((i) => i.workspace_id === w.id).length;
              const wsChanges = changes.filter((i) => i.workspace_id === w.id).length;
              return (
                <StaggerItem as="li" key={w.id}>
                  <Link href={`/w/${w.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-sunken sm:px-5">
                    <span className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                      <Avatar name={w.name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-ink">{w.name}</span>
                        <span className="block text-xs text-muted">
                          {published} of {rows.reduce((n, r) => n + r.quota, 0)} published
                        </span>
                      </span>
                    </span>
                    <AnimatedBar
                      className="w-full basis-full sm:w-40 sm:basis-auto"
                      label={`${published} published, ${ready} ready`}
                      segments={[
                        { value: (published / quota) * 100, className: "bg-emerald-600" },
                        { value: (ready / quota) * 100, className: "bg-green-400" },
                      ]}
                    />
                    <span className="flex gap-1.5">
                      {wsChanges ? <Badge tone="orange">{wsChanges} to revise</Badge> : null}
                      {wsAwaiting ? <Badge tone="blue">{wsAwaiting} with client</Badge> : null}
                      {!wsChanges && !wsAwaiting ? (
                        !plan || plan.status === "draft" ? <Badge>Plan not shared</Badge> : <Badge tone="green">On track</Badge>
                      ) : null}
                    </span>
                  </Link>
                </StaggerItem>
              );
            })}
          </Stagger>
        ) : (
          <CaughtUp title="No clients yet">{isAdmin ? "Create the first client workspace to get started." : "Ask an admin to assign you to a client."}</CaughtUp>
        )}
      </Card>
    </div>
  );
}

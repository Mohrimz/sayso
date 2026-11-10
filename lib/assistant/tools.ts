import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/database.types";
import { CONTENT_TYPES, deliverables, deliverableSummary, platformLabel, statusView } from "@/lib/content";
import { currentMonth, formatDate, todayKey, zonedDayKey, zonedInputToIso } from "@/lib/dates";
import { asArray, asObject, type ContentStatus, type Faq, type KeyDate, type Quotas, type SocialAccount } from "@/lib/types";
import { offerPreview, recentOfferSince } from "@/lib/offers";

/**
 * Read-only tools the team assistant can call. Every query runs through the
 * signed-in person's Supabase client, so row-level security limits answers to
 * the clients that person can already open. Nothing here writes data.
 */

type DB = SupabaseClient<Database>;
type WorkspaceRow = Pick<Database["public"]["Tables"]["workspaces"]["Row"], "id" | "slug" | "name" | "status" | "time_zone">;
type Person = { name: string; side: "agency" | "client" };

export type AssistantViewer = { id: string; name: string; isAdmin: boolean };

const ITEM_COLUMNS =
  "id, workspace_id, title, type, status, client_decision, planned_at, approval_deadline, assignee_id, reviewer_id, platforms, revision_count, published_at";

type ItemRow = Pick<
  Database["public"]["Tables"]["content_items"]["Row"],
  | "id"
  | "workspace_id"
  | "title"
  | "type"
  | "status"
  | "client_decision"
  | "planned_at"
  | "approval_deadline"
  | "assignee_id"
  | "reviewer_id"
  | "platforms"
  | "revision_count"
  | "published_at"
>;

/** A problem the model can fix by changing its input, e.g. an unknown client name. */
class ToolInputError extends Error {}

const LIST_CAP = 15;
const snippet = (text: string | null | undefined, max = 240) => {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};
const hoursAgoIso = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

/** "Sat 14 Nov, 08:30 GMT": always says which time zone a time is in, so answers never mix them up. */
function formatDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

/**
 * Per-request data access shared by all tool calls in one answer, so client
 * and people lookups only hit the database once.
 */
export class AssistantData {
  private workspacesPromise: Promise<WorkspaceRow[]> | null = null;
  private people = new Map<string, Person>();

  constructor(
    readonly supabase: DB,
    readonly viewer: AssistantViewer,
    readonly timeZone: string,
  ) {}

  workspaces(): Promise<WorkspaceRow[]> {
    this.workspacesPromise ??= (async () => {
      const { data, error } = await this.supabase.from("workspaces").select("id, slug, name, status, time_zone").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    })();
    return this.workspacesPromise;
  }

  async workspaceMap(): Promise<Map<string, WorkspaceRow>> {
    return new Map((await this.workspaces()).map((w) => [w.id, w]));
  }

  /** The clients a question is about: one named client, or every active client. */
  async resolveClients(client: string | undefined, includeArchived = false): Promise<WorkspaceRow[]> {
    const all = await this.workspaces();
    const visible = includeArchived ? all : all.filter((w) => w.status !== "archived");
    if (!client?.trim()) {
      if (!visible.length) throw new ToolInputError("This person isn't assigned to any active clients yet.");
      return visible;
    }
    const q = client.trim().toLowerCase();
    const exact = all.filter((w) => w.name.toLowerCase() === q || w.slug.toLowerCase() === q);
    if (exact.length === 1) return exact;
    const partial = all.filter((w) => w.name.toLowerCase().includes(q) || w.slug.toLowerCase().includes(q));
    if (partial.length === 1) return partial;
    if (partial.length > 1) {
      throw new ToolInputError(`Several clients match "${client}": ${partial.map((w) => w.name).join(", ")}. Ask which one.`);
    }
    throw new ToolInputError(
      `No client matches "${client}". Clients this person can see: ${visible.map((w) => w.name).join(", ") || "none"}.`,
    );
  }

  async loadPeople(ids: (string | null | undefined)[]) {
    const missing = [...new Set(ids.filter((id): id is string => Boolean(id) && !this.people.has(id!)))];
    if (!missing.length) return;
    const { data } = await this.supabase.from("profiles").select("id, full_name, email, side").in("id", missing);
    for (const p of data ?? []) {
      this.people.set(p.id, { name: p.full_name || p.email.split("@")[0], side: p.side });
    }
  }

  personName(id: string | null | undefined): string | null {
    if (!id) return null;
    if (id === this.viewer.id) return "you";
    return this.people.get(id)?.name ?? "a former member";
  }

  personSide(id: string | null | undefined): "agency" | "client" | null {
    return id ? (this.people.get(id)?.side ?? null) : null;
  }

  /** Resolves "me", "unassigned" or a (partial) agency person's name to user ids. */
  async resolveAssignee(who: string): Promise<string[] | "unassigned"> {
    const q = who.trim().toLowerCase();
    if (["me", "my", "mine", "myself", "you"].includes(q)) return [this.viewer.id];
    if (["unassigned", "nobody", "none"].includes(q)) return "unassigned";
    const { data } = await this.supabase.from("profiles").select("id, full_name, email").eq("side", "agency");
    const matches = (data ?? []).filter(
      (p) => (p.full_name ?? "").toLowerCase().includes(q) || p.email.toLowerCase().includes(q),
    );
    if (!matches.length) throw new ToolInputError(`No agency team member matches "${who}".`);
    return matches.map((p) => p.id);
  }

  item(i: ItemRow, ws: WorkspaceRow) {
    return {
      id: i.id,
      title: i.title,
      client: ws.name,
      type: CONTENT_TYPES[i.type]?.label ?? i.type,
      status: statusView(i, "agency").label,
      planned_for: i.planned_at ? formatDateTime(i.planned_at, ws.time_zone) : null,
      approval_deadline:
        i.status === "client_review" && i.approval_deadline ? formatDateTime(i.approval_deadline, ws.time_zone) : undefined,
      approval_overdue: i.status === "client_review" && i.approval_deadline ? i.approval_deadline < new Date().toISOString() : undefined,
      assignee: this.personName(i.assignee_id),
      link: `/w/${ws.slug}/content/${i.id}`,
    };
  }
}

const capped = <T,>(list: T[], cap = LIST_CAP) => ({
  total: list.length,
  items: list.slice(0, cap),
  ...(list.length > cap ? { note: `Showing ${cap} of ${list.length}.` } : {}),
});

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const clientParam = z
  .string()
  .max(120)
  .optional()
  .describe("A client's name or part of it. Leave out to cover every client this person works on.");

const DailyBriefing = z.object({ client: clientParam });

async function dailyBriefing(input: z.infer<typeof DailyBriefing>, data: AssistantData) {
  const workspaces = await data.resolveClients(input.client);
  const ids = workspaces.map((w) => w.id);
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const since = hoursAgoIso(24);
  const nowIso = new Date().toISOString();
  const { supabase, viewer } = data;

  const [openRes, publishedRes, tasksRes, approvalsRes, commentsRes, threadsRes, offersRes] = await Promise.all([
    supabase.from("content_items").select(ITEM_COLUMNS).in("workspace_id", ids).neq("status", "published").order("planned_at", { ascending: true }),
    supabase.from("content_items").select(ITEM_COLUMNS).in("workspace_id", ids).gte("published_at", since),
    supabase
      .from("tasks")
      .select("id, workspace_id, title, status, due_date, owner_id, owner_side, internal")
      .in("workspace_id", ids)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase
      .from("approvals")
      .select("content_item_id, decision, approver_id, comment, created_at, workspace_id")
      .in("workspace_id", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
    supabase
      .from("comments")
      .select("content_item_id, author_id, body, created_at, workspace_id")
      .in("workspace_id", ids)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.rpc("chat_threads"),
    supabase
      .from("offers")
      .select("id, workspace_id, message, created_at, created_by")
      .in("workspace_id", ids)
      .gte("created_at", recentOfferSince(14))
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const open = (openRes.data ?? []) as ItemRow[];
  const tasks = tasksRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const comments = commentsRes.data ?? [];
  await data.loadPeople([
    ...open.flatMap((i) => [i.assignee_id, i.reviewer_id]),
    ...tasks.map((t) => t.owner_id),
    ...approvals.map((a) => a.approver_id),
    ...comments.map((c) => c.author_id),
    ...(offersRes.data ?? []).map((o) => o.created_by),
  ]);

  const itemTitles = new Map<string, { title: string; ws: WorkspaceRow }>();
  for (const i of [...open, ...((publishedRes.data ?? []) as ItemRow[])]) itemTitles.set(i.id, { title: i.title, ws: wsById.get(i.workspace_id)! });
  const missingTitles = [...new Set([...approvals, ...comments].map((r) => r.content_item_id).filter((id) => !itemTitles.has(id)))];
  if (missingTitles.length) {
    const { data: rows } = await supabase.from("content_items").select("id, title, workspace_id").in("id", missingTitles);
    for (const r of rows ?? []) itemTitles.set(r.id, { title: r.title, ws: wsById.get(r.workspace_id)! });
  }

  const summarize = (i: ItemRow) => data.item(i, wsById.get(i.workspace_id)!);
  const dayOf = (i: ItemRow) => (i.planned_at ? zonedDayKey(i.planned_at, wsById.get(i.workspace_id)!.time_zone) : null);
  const today = (ws: WorkspaceRow) => todayKey(ws.time_zone);
  const tomorrow = (ws: WorkspaceRow) => zonedDayKey(new Date(Date.now() + 86_400_000).toISOString(), ws.time_zone);

  const changesRequested = open.filter((i) => i.status === "draft" && i.client_decision === "changes_requested");
  const internalReview = open.filter((i) => i.status === "internal_review");
  const myWork = open.filter(
    (i) => i.assignee_id === viewer.id && ["planned", "draft"].includes(i.status) && i.client_decision !== "changes_requested",
  );
  const awaiting = open.filter((i) => i.status === "client_review");
  const overdueApprovals = awaiting.filter((i) => i.approval_deadline && i.approval_deadline < nowIso);
  const goingOut = open.filter((i) => {
    const ws = wsById.get(i.workspace_id)!;
    const day = dayOf(i);
    return day === today(ws) || day === tomorrow(ws);
  });
  const lateUnpublished = open.filter((i) => i.planned_at && i.planned_at < nowIso && i.status !== "scheduled");

  const taskView = (t: (typeof tasks)[number]) => {
    const ws = wsById.get(t.workspace_id)!;
    const todayKeyWs = today(ws);
    return {
      title: t.title,
      client: ws.name,
      status: t.status === "in_progress" ? "In progress" : t.status === "in_review" ? "Submitted, waiting for review" : "To do",
      due: t.due_date ? formatDate(t.due_date) : null,
      overdue: t.due_date ? t.due_date < todayKeyWs : false,
      due_today: t.due_date === todayKeyWs,
      owner: t.owner_side === "client" ? `${data.personName(t.owner_id) ?? "the client"} (client)` : (data.personName(t.owner_id) ?? "unassigned"),
      visible_to_client: !t.internal,
      link: `/w/${ws.slug}/tasks`,
    };
  };
  const myTasks = tasks.filter((t) => t.owner_side === "agency" && t.owner_id === viewer.id).map(taskView);
  const clientTasksOverdue = tasks.filter((t) => t.owner_side === "client").map(taskView).filter((t) => t.overdue);

  const unreadChats = (threadsRes.data ?? [])
    .filter((t) => t.unread > 0 && wsById.has(t.workspace_id))
    .map((t) => {
      const ws = wsById.get(t.workspace_id)!;
      return {
        client: ws.name,
        chat: t.channel === "team" ? "team-only chat" : "client chat",
        unread: t.unread,
        last_message: t.last_deleted ? "(deleted)" : snippet(t.last_body, 160),
        link: t.channel === "team" ? `/w/${ws.slug}/chat/team` : `/w/${ws.slug}/chat`,
      };
    });

  const clientOffers = (offersRes.data ?? []).flatMap((o) => {
    const ws = wsById.get(o.workspace_id);
    if (!ws) return [];
    return [
      {
        client: ws.name,
        offer: offerPreview(o.message, 400),
        shared: formatDateTime(o.created_at, ws.time_zone),
        shared_in_last_24_hours: o.created_at >= since,
        shared_by: data.personName(o.created_by),
        link: `/w/${ws.slug}/offers#offer-${o.id}`,
      },
    ];
  });

  const clientComments = new Map<string, number>();
  for (const c of comments) {
    if (data.personSide(c.author_id) === "client") clientComments.set(c.content_item_id, (clientComments.get(c.content_item_id) ?? 0) + 1);
  }

  return {
    covering: input.client ? workspaces.map((w) => w.name).join(", ") : `all ${workspaces.length} active clients you work on`,
    needs_attention: {
      changes_requested_by_client: capped(changesRequested.map(summarize)),
      // Only agency admins review posts and send them to the client.
      ...(viewer.isAdmin
        ? {
            waiting_for_your_internal_review: capped(
              internalReview.map((i) => ({ ...summarize(i), reviewer: data.personName(i.reviewer_id) ?? "any agency admin" })),
            ),
          }
        : {}),
      assigned_to_you_not_started_or_in_draft: capped(myWork.map(summarize)),
      approvals_past_deadline: capped(overdueApprovals.map(summarize)),
      planned_time_passed_but_not_scheduled_or_published: capped(lateUnpublished.map(summarize)),
    },
    ...(viewer.isAdmin ? {} : { sent_for_admin_review: capped(internalReview.map(summarize)) }),
    awaiting_client_approval: capped(awaiting.map(summarize)),
    planned_for_today_or_tomorrow: capped(
      goingOut.map((i) => ({
        ...summarize(i),
        day: dayOf(i) === today(wsById.get(i.workspace_id)!) ? "today" : "tomorrow",
        ready: ["approved", "scheduled"].includes(i.status),
      })),
    ),
    your_open_tasks: capped(myTasks),
    client_tasks_overdue: capped(clientTasksOverdue),
    unread_chats: unreadChats,
    client_offers_shared_in_last_2_weeks: capped(clientOffers),
    last_24_hours: {
      client_decisions: capped(
        approvals.map((a) => {
          const item = itemTitles.get(a.content_item_id);
          const stillAwaiting = a.decision === "approved" && awaiting.some((i) => i.id === a.content_item_id);
          return {
            post: item?.title ?? "a post",
            client: item?.ws.name,
            decision: a.decision === "approved" ? "approved" : "requested changes",
            by: data.personName(a.approver_id),
            comment: a.comment ? snippet(a.comment) : undefined,
            note: stillAwaiting ? "Still waiting: this post needs more than one approver to sign off (the client's approval rule, or a tag rule on this post such as AI-generated content)." : undefined,
            link: item ? `/w/${item.ws.slug}/content/${a.content_item_id}` : undefined,
          };
        }),
      ),
      posts_with_new_client_comments: [...clientComments.entries()].map(([id, count]) => {
        const item = itemTitles.get(id);
        return { post: item?.title ?? "a post", client: item?.ws.name, new_comments: count, link: item ? `/w/${item.ws.slug}/content/${id}` : undefined };
      }),
      published: ((publishedRes.data ?? []) as ItemRow[]).map(summarize),
    },
  };
}

const ListClients = z.object({
  include_archived: z.boolean().optional().describe("Also list archived clients. Defaults to false."),
});

async function listClients(input: z.infer<typeof ListClients>, data: AssistantData) {
  const workspaces = await data.resolveClients(undefined, input.include_archived ?? false).catch((e) => {
    if (e instanceof ToolInputError) return [];
    throw e;
  });
  if (!workspaces.length) return { clients: [], note: "No clients to show." };
  const ids = workspaces.map((w) => w.id);
  const months = [...new Set(workspaces.map((w) => `${currentMonth(w.time_zone)}-01`))];
  const { supabase } = data;

  const [details, plans, open, tasks] = await Promise.all([
    supabase.from("workspaces").select("id, quotas").in("id", ids),
    supabase.from("monthly_plans").select("id, workspace_id, month, status").in("workspace_id", ids).in("month", months),
    supabase.from("content_items").select("workspace_id, status, client_decision, approval_deadline").in("workspace_id", ids).neq("status", "published"),
    supabase.from("tasks").select("workspace_id, owner_side").in("workspace_id", ids).neq("status", "done"),
  ]);
  const currentPlans = (plans.data ?? []).filter((p) => {
    const ws = workspaces.find((w) => w.id === p.workspace_id);
    return ws && p.month === `${currentMonth(ws.time_zone)}-01`;
  });
  const planItems = currentPlans.length
    ? ((await supabase.from("content_items").select("plan_id, type, status").in("plan_id", currentPlans.map((p) => p.id))).data ?? [])
    : [];
  const nowIso = new Date().toISOString();

  return {
    clients: workspaces.map((ws) => {
      const quotas = asObject<Quotas>(details.data?.find((d) => d.id === ws.id)?.quotas);
      const plan = currentPlans.find((p) => p.workspace_id === ws.id);
      const items = (open.data ?? []).filter((i) => i.workspace_id === ws.id);
      const wsTasks = (tasks.data ?? []).filter((t) => t.workspace_id === ws.id);
      return {
        name: ws.name,
        status: ws.status,
        time_zone: ws.time_zone,
        this_month: plan
          ? {
              plan_status: plan.status,
              deliverables: deliverables(planItems.filter((i) => i.plan_id === plan.id), quotas).map(
                (row) => `${row.label}: ${deliverableSummary(row)}`,
              ),
            }
          : "No plan for this month yet",
        open_work: {
          awaiting_approval: items.filter((i) => i.status === "client_review").length,
          approvals_overdue: items.filter((i) => i.status === "client_review" && i.approval_deadline && i.approval_deadline < nowIso).length,
          changes_requested: items.filter((i) => i.status === "draft" && i.client_decision === "changes_requested").length,
          internal_review: items.filter((i) => i.status === "internal_review").length,
          open_agency_tasks: wsTasks.filter((t) => t.owner_side === "agency").length,
          open_client_tasks: wsTasks.filter((t) => t.owner_side === "client").length,
        },
        link: `/w/${ws.slug}`,
      };
    }),
  };
}

const STATUS_FILTERS = [
  "planned",
  "draft",
  "changes_requested",
  "internal_review",
  "client_review",
  "approved",
  "scheduled",
  "published",
] as const;
const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const FindContent = z.object({
  client: clientParam,
  status: z
    .array(z.enum(STATUS_FILTERS))
    .optional()
    .describe('Content statuses to include. "client_review" means awaiting client approval; "changes_requested" means the client sent it back.'),
  type: z.enum(["feed_post", "carousel", "reel", "story"]).optional(),
  assigned_to: z.string().max(120).optional().describe('"me", "unassigned", or an agency team member\'s name.'),
  planned_from: dateParam.optional().describe("Earliest planned date, YYYY-MM-DD, inclusive."),
  planned_to: dateParam.optional().describe("Latest planned date, YYYY-MM-DD, inclusive."),
  search: z.string().max(120).optional().describe("Words to look for in the post title."),
  limit: z.number().int().min(1).max(50).optional().describe("Defaults to 25."),
});

async function findContent(input: z.infer<typeof FindContent>, data: AssistantData) {
  const workspaces = await data.resolveClients(input.client);
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  let query = data.supabase
    .from("content_items")
    .select(ITEM_COLUMNS)
    .in("workspace_id", workspaces.map((w) => w.id))
    .order("planned_at", { ascending: true, nullsFirst: false })
    .limit(500);

  const statuses = input.status ?? [];
  if (statuses.length) {
    const real = [...new Set(statuses.map((s) => (s === "changes_requested" ? "draft" : s)))] as ContentStatus[];
    query = query.in("status", real);
  }
  if (input.type) query = query.eq("type", input.type);
  if (input.assigned_to) {
    const who = await data.resolveAssignee(input.assigned_to);
    query = who === "unassigned" ? query.is("assignee_id", null) : query.in("assignee_id", who);
  }
  if (input.planned_from) query = query.gte("planned_at", zonedInputToIso(`${input.planned_from}T00:00`, data.timeZone) ?? input.planned_from);
  if (input.planned_to) query = query.lte("planned_at", zonedInputToIso(`${input.planned_to}T23:59`, data.timeZone) ?? input.planned_to);
  if (input.search) query = query.ilike("title", `%${input.search.replace(/[%_]/g, "")}%`);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  let items = (rows ?? []) as ItemRow[];
  if (statuses.length) {
    const wantChanges = statuses.includes("changes_requested");
    const wantDraft = statuses.includes("draft");
    items = items.filter((i) => {
      if (i.status !== "draft") return true;
      const revising = i.client_decision === "changes_requested";
      return revising ? wantChanges : wantDraft;
    });
  }
  await data.loadPeople(items.map((i) => i.assignee_id));
  const limit = input.limit ?? 25;
  return {
    total_matching: items.length,
    showing: Math.min(limit, items.length),
    items: items.slice(0, limit).map((i) => ({
      ...data.item(i, wsById.get(i.workspace_id)!),
      platforms: i.platforms.map(platformLabel),
      revisions_used: i.revision_count,
    })),
  };
}

const ContentDetails = z.object({
  content_id: z
    .string()
    .regex(/^[0-9a-f-]{36}$/i, "Use the id from another tool's results")
    .describe("The content item's id, from get_daily_briefing or find_content results."),
});

async function contentDetails(input: z.infer<typeof ContentDetails>, data: AssistantData) {
  const { supabase } = data;
  const { data: item } = await supabase.from("content_items").select("*").eq("id", input.content_id).maybeSingle();
  if (!item) throw new ToolInputError("No post with that id, or this person can't see it.");
  const ws = (await data.workspaceMap()).get(item.workspace_id);
  if (!ws) throw new ToolInputError("This person can't see that client.");

  const [wsRow, approvals, comments, notes, tasks] = await Promise.all([
    supabase.from("workspaces").select("revision_rounds").eq("id", ws.id).maybeSingle(),
    supabase
      .from("approvals")
      .select("decision, approver_id, comment, created_at")
      .eq("content_item_id", item.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("comments")
      .select("author_id, body, kind, resolved, created_at")
      .eq("content_item_id", item.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("internal_notes")
      .select("author_id, body, decision, created_at")
      .eq("content_item_id", item.id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("tasks").select("title, status, due_date, owner_id, owner_side").eq("content_item_id", item.id),
  ]);
  await data.loadPeople([
    item.assignee_id,
    item.reviewer_id,
    ...(approvals.data ?? []).map((a) => a.approver_id),
    ...(comments.data ?? []).map((c) => c.author_id),
    ...(notes.data ?? []).map((n) => n.author_id),
    ...(tasks.data ?? []).map((t) => t.owner_id),
  ]);
  const when = (iso: string) => formatDateTime(iso, ws.time_zone);

  return {
    ...data.item(item, ws),
    reviewer: data.personName(item.reviewer_id),
    platforms: item.platforms.map(platformLabel),
    tags: item.tags,
    captions: asObject<Record<string, string>>(item.captions),
    hashtags: item.hashtags,
    on_screen_text: item.on_screen_text,
    link_in_post: item.link_url,
    live_url: item.live_url,
    version: item.current_version,
    revisions_used: `${item.revision_count} of ${wsRow.data?.revision_rounds ?? "?"} included rounds`,
    sent_for_approval: item.sent_for_approval_at ? when(item.sent_for_approval_at) : null,
    approved: item.approved_at ? when(item.approved_at) : null,
    published: item.published_at ? when(item.published_at) : null,
    client_decisions: (approvals.data ?? []).map((a) => ({
      decision: a.decision === "approved" ? "approved" : "requested changes",
      by: data.personName(a.approver_id),
      comment: a.comment ? snippet(a.comment, 600) : undefined,
      at: when(a.created_at),
    })),
    comments_newest_first: (comments.data ?? []).map((c) => ({
      by: data.personName(c.author_id),
      side: data.personSide(c.author_id),
      text: snippet(c.body, 600),
      resolved: c.resolved,
      at: when(c.created_at),
    })),
    internal_notes_newest_first: (notes.data ?? []).map((n) => ({
      by: data.personName(n.author_id),
      decision: n.decision === "fixes_needed" ? "fixes needed" : n.decision === "passed" ? "passed" : undefined,
      text: snippet(n.body, 600),
      at: when(n.created_at),
    })),
    linked_tasks: (tasks.data ?? []).map((t) => ({
      title: t.title,
      status: t.status,
      due: t.due_date ? formatDate(t.due_date) : null,
      owner: t.owner_side === "client" ? "client" : (data.personName(t.owner_id) ?? "unassigned"),
    })),
  };
}

const FindTasks = z.object({
  client: clientParam,
  owner: z
    .enum(["me", "agency", "client", "anyone"])
    .optional()
    .describe('"me" = tasks owned by this person; "agency" = any agency task; "client" = things the client must do. Defaults to "anyone".'),
  status: z
    .array(z.enum(["todo", "in_progress", "in_review", "done"]))
    .optional()
    .describe("Defaults to open tasks (todo, in_progress and in_review). in_review means the work was submitted and waits for an admin's review."),
  due: z.enum(["overdue", "today", "next_7_days", "no_date", "any"]).optional().describe('Defaults to "any".'),
  search: z.string().max(120).optional().describe("Words to look for in the task title."),
  limit: z.number().int().min(1).max(50).optional().describe("Defaults to 25."),
});

async function findTasks(input: z.infer<typeof FindTasks>, data: AssistantData) {
  const workspaces = await data.resolveClients(input.client);
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  let query = data.supabase
    .from("tasks")
    .select("id, workspace_id, title, description, status, due_date, owner_id, owner_side, internal, content_item_id, completed_at")
    .in("workspace_id", workspaces.map((w) => w.id))
    .in("status", input.status?.length ? input.status : ["todo", "in_progress", "in_review"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);
  const owner = input.owner ?? "anyone";
  if (owner === "me") query = query.eq("owner_side", "agency").eq("owner_id", data.viewer.id);
  if (owner === "agency") query = query.eq("owner_side", "agency");
  if (owner === "client") query = query.eq("owner_side", "client");
  if (input.search) query = query.ilike("title", `%${input.search.replace(/[%_]/g, "")}%`);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  const due = input.due ?? "any";
  const tasks = (rows ?? []).filter((t) => {
    if (due === "any") return true;
    if (due === "no_date") return !t.due_date;
    if (!t.due_date) return false;
    const today = todayKey(wsById.get(t.workspace_id)!.time_zone);
    if (due === "overdue") return t.due_date < today && t.status !== "done";
    if (due === "today") return t.due_date === today;
    const week = zonedDayKey(new Date(Date.now() + 7 * 86_400_000).toISOString(), wsById.get(t.workspace_id)!.time_zone);
    return t.due_date >= today && t.due_date <= week;
  });
  await data.loadPeople(tasks.map((t) => t.owner_id));
  const limit = input.limit ?? 25;
  return {
    total_matching: tasks.length,
    showing: Math.min(limit, tasks.length),
    tasks: tasks.slice(0, limit).map((t) => {
      const ws = wsById.get(t.workspace_id)!;
      return {
        title: t.title,
        details: t.description ? snippet(t.description, 300) : undefined,
        client: ws.name,
        status: t.status === "in_progress" ? "In progress" : t.status === "in_review" ? "Submitted, waiting for review" : t.status === "done" ? "Done" : "To do",
        due: t.due_date ? formatDate(t.due_date) : null,
        overdue: t.due_date && t.status !== "done" ? t.due_date < todayKey(ws.time_zone) : false,
        owner: t.owner_side === "client" ? `${data.personName(t.owner_id) ?? "the client"} (client)` : (data.personName(t.owner_id) ?? "unassigned"),
        visible_to_client: !t.internal,
        link: t.content_item_id ? `/w/${ws.slug}/content/${t.content_item_id}` : `/w/${ws.slug}/tasks`,
      };
    }),
  };
}

const RecentActivity = z.object({
  client: clientParam,
  hours: z.number().int().min(1).max(336).optional().describe("How far back to look, in hours. Defaults to 24; 168 is a week."),
  limit: z.number().int().min(1).max(80).optional().describe("Most recent events to return. Defaults to 40."),
});

async function recentActivity(input: z.infer<typeof RecentActivity>, data: AssistantData) {
  const workspaces = await data.resolveClients(input.client);
  const ids = workspaces.map((w) => w.id);
  const wsById = new Map(workspaces.map((w) => [w.id, w]));
  const since = hoursAgoIso(input.hours ?? 24);
  const { supabase } = data;
  const recent = { ascending: false } as const;

  const [approvals, comments, notes, messages, updates, published, done] = await Promise.all([
    supabase.from("approvals").select("content_item_id, decision, approver_id, comment, created_at, workspace_id").in("workspace_id", ids).gte("created_at", since).order("created_at", recent).limit(100),
    supabase.from("comments").select("content_item_id, author_id, body, created_at, workspace_id").in("workspace_id", ids).gte("created_at", since).order("created_at", recent).limit(100),
    supabase.from("internal_notes").select("content_item_id, author_id, body, decision, created_at, workspace_id").in("workspace_id", ids).gte("created_at", since).order("created_at", recent).limit(100),
    supabase.from("messages").select("workspace_id, channel, author_id, body, attachments, created_at").in("workspace_id", ids).is("deleted_at", null).gte("created_at", since).order("created_at", recent).limit(150),
    supabase.from("progress_updates").select("workspace_id, author_id, body, created_at").in("workspace_id", ids).gte("created_at", since).order("created_at", recent).limit(50),
    supabase.from("content_items").select("id, title, workspace_id, published_at, live_url").in("workspace_id", ids).gte("published_at", since).limit(100),
    supabase.from("tasks").select("title, workspace_id, owner_id, owner_side, completed_at").in("workspace_id", ids).gte("completed_at", since).limit(100),
  ]);

  const itemIds = [...new Set([...(approvals.data ?? []), ...(comments.data ?? []), ...(notes.data ?? [])].map((r) => r.content_item_id))];
  const titles = new Map<string, string>();
  if (itemIds.length) {
    const { data: rows } = await supabase.from("content_items").select("id, title").in("id", itemIds);
    for (const r of rows ?? []) titles.set(r.id, r.title);
  }
  await data.loadPeople([
    ...(approvals.data ?? []).map((r) => r.approver_id),
    ...(comments.data ?? []).map((r) => r.author_id),
    ...(notes.data ?? []).map((r) => r.author_id),
    ...(messages.data ?? []).map((r) => r.author_id),
    ...(updates.data ?? []).map((r) => r.author_id),
    ...(done.data ?? []).map((r) => r.owner_id),
  ]);

  type Event = { at: string; client: string; what: string; by?: string | null; text?: string; link?: string };
  const events: Event[] = [];
  const ws = (id: string) => wsById.get(id)!;
  const post = (id: string, workspaceId: string) => ({ title: titles.get(id) ?? "a post", link: `/w/${ws(workspaceId).slug}/content/${id}` });

  for (const a of approvals.data ?? []) {
    const p = post(a.content_item_id, a.workspace_id);
    events.push({
      at: a.created_at,
      client: ws(a.workspace_id).name,
      what: `${a.decision === "approved" ? "Approved" : "Requested changes on"} "${p.title}"`,
      by: data.personName(a.approver_id),
      text: a.comment ? snippet(a.comment) : undefined,
      link: p.link,
    });
  }
  for (const c of comments.data ?? []) {
    const p = post(c.content_item_id, c.workspace_id);
    const side = data.personSide(c.author_id);
    events.push({
      at: c.created_at,
      client: ws(c.workspace_id).name,
      what: `${side === "client" ? "Client comment" : "Agency comment"} on "${p.title}"`,
      by: data.personName(c.author_id),
      text: snippet(c.body),
      link: p.link,
    });
  }
  for (const n of notes.data ?? []) {
    const p = post(n.content_item_id, n.workspace_id);
    events.push({
      at: n.created_at,
      client: ws(n.workspace_id).name,
      what: `Internal note${n.decision === "fixes_needed" ? " (fixes needed)" : n.decision === "passed" ? " (passed review)" : ""} on "${p.title}"`,
      by: data.personName(n.author_id),
      text: snippet(n.body),
      link: p.link,
    });
  }
  for (const m of messages.data ?? []) {
    const files = asArray(m.attachments).length;
    events.push({
      at: m.created_at,
      client: ws(m.workspace_id).name,
      what: m.channel === "team" ? "Team-only chat message" : "Client chat message",
      by: data.personName(m.author_id),
      text: snippet(m.body) || (files ? `Sent ${files} file${files === 1 ? "" : "s"}` : undefined),
      link: m.channel === "team" ? `/w/${ws(m.workspace_id).slug}/chat/team` : `/w/${ws(m.workspace_id).slug}/chat`,
    });
  }
  for (const u of updates.data ?? []) {
    events.push({ at: u.created_at, client: ws(u.workspace_id).name, what: "Progress update posted", by: data.personName(u.author_id), text: snippet(u.body) });
  }
  for (const p of published.data ?? []) {
    events.push({ at: p.published_at!, client: ws(p.workspace_id).name, what: `Published "${p.title}"`, link: `/w/${ws(p.workspace_id).slug}/content/${p.id}` });
  }
  for (const t of done.data ?? []) {
    events.push({
      at: t.completed_at!,
      client: ws(t.workspace_id).name,
      what: `Task done: "${t.title}"`,
      by: t.owner_side === "client" ? "the client" : data.personName(t.owner_id),
      link: `/w/${ws(t.workspace_id).slug}/tasks`,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  const limit = input.limit ?? 40;
  return {
    since: formatDateTime(since, data.timeZone),
    total_events: events.length,
    showing: Math.min(limit, events.length),
    events_newest_first: events.slice(0, limit).map((e) => ({ ...e, at: formatDateTime(e.at, data.timeZone) })),
  };
}

const ClientProfile = z.object({
  client: z.string().min(1).max(120).describe("The client's name or part of it."),
});

async function clientProfile(input: z.infer<typeof ClientProfile>, data: AssistantData) {
  const [ws] = await data.resolveClients(input.client, true);
  const { supabase } = data;
  const month = currentMonth(ws.time_zone);
  const [full, plan, brand, members, offers] = await Promise.all([
    supabase.from("workspaces").select("*").eq("id", ws.id).maybeSingle(),
    supabase.from("monthly_plans").select("id, status, themes, goals, key_dates").eq("workspace_id", ws.id).eq("month", `${month}-01`).maybeSingle(),
    supabase.from("brand_kits").select("tone, topics_to_avoid, notes, faq").eq("workspace_id", ws.id).maybeSingle(),
    supabase.from("workspace_members").select("user_id, role").eq("workspace_id", ws.id),
    supabase
      .from("offers")
      .select("id, message, created_at")
      .eq("workspace_id", ws.id)
      .gte("created_at", recentOfferSince())
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const w = full.data;
  if (!w) throw new ToolInputError("This person can't see that client.");
  await data.loadPeople((members.data ?? []).map((m) => m.user_id));

  return {
    name: w.name,
    status: w.status,
    time_zone: w.time_zone,
    website: w.website,
    main_contact: w.main_contact_name ? `${w.main_contact_name}${w.main_contact_email ? ` <${w.main_contact_email}>` : ""}` : null,
    goals_focus: w.goals_focus,
    success_measures: w.success_measures,
    social_accounts: asArray<SocialAccount>(w.social_accounts).map((a) => `${platformLabel(a.platform)}: ${a.handle}`),
    monthly_quotas: asObject<Quotas>(w.quotas),
    revision_rounds_per_post: w.revision_rounds,
    approval_rule: w.approval_rule === "all" ? "every approver must approve" : "one approval is enough",
    this_month_plan: plan.data
      ? {
          month,
          status: plan.data.status,
          themes: plan.data.themes,
          goals: plan.data.goals,
          key_dates: asArray<KeyDate>(plan.data.key_dates).map((d) => `${formatDate(d.date)}: ${d.label}`),
          link: `/w/${ws.slug}/plan/${month}`,
        }
      : `No plan for ${month} yet`,
    brand: brand.data
      ? {
          tone: brand.data.tone,
          topics_to_avoid: brand.data.topics_to_avoid,
          notes: brand.data.notes ? snippet(brand.data.notes, 3000) : null,
          faq: asArray<Faq>(brand.data.faq).slice(0, 10),
          link: `/w/${ws.slug}/brand`,
        }
      : null,
    offers_shared_in_last_month: (offers.data ?? []).map((o) => ({
      offer: snippet(o.message, 400),
      shared: formatDateTime(o.created_at, ws.time_zone),
      link: `/w/${ws.slug}/offers#offer-${o.id}`,
    })),
    people: (members.data ?? []).map((m) => ({
      name: data.personName(m.user_id),
      role: m.role === "team_member" ? "agency team member" : m.role === "approver" ? "client approver" : "client viewer",
    })),
    link: `/w/${ws.slug}`,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

type ToolSpec = {
  name: string;
  /** Shown in the chat while the tool runs. */
  label: string;
  description: string;
  schema: z.ZodObject;
  run: (input: never, data: AssistantData) => Promise<unknown>;
};

const SPECS: ToolSpec[] = [
  {
    name: "get_daily_briefing",
    label: "Checking today's work",
    description:
      "The day's briefing: what needs attention (client change requests, internal reviews, the person's own drafts, overdue approvals, posts whose planned time passed), posts awaiting client approval, posts planned for today or tomorrow, the person's open tasks, overdue client tasks, unread chats, offers clients shared in the last two weeks (sales, discounts, launches, as the client wrote them), and the last 24 hours of client decisions, client comments and published posts. Use it for any \"what's the update / what's on today / what should I do\" question.",
    schema: DailyBriefing,
    run: dailyBriefing as ToolSpec["run"],
  },
  {
    name: "list_clients",
    label: "Looking at clients",
    description:
      "Every client this person works on, with this month's plan status, deliverable progress against the package quotas, and counts of open work. Use it for overviews and to compare clients.",
    schema: ListClients,
    run: listClients as ToolSpec["run"],
  },
  {
    name: "find_content",
    label: "Searching posts",
    description:
      "Search posts, reels and stories by client, status, type, assignee, planned date range or title words. Returns ids that get_content_details accepts.",
    schema: FindContent,
    run: findContent as ToolSpec["run"],
  },
  {
    name: "get_content_details",
    label: "Opening the post",
    description:
      "Everything about one post: captions per platform, hashtags, status and dates, client decisions, comments, internal notes and linked tasks. Needs the id from another tool.",
    schema: ContentDetails,
    run: contentDetails as ToolSpec["run"],
  },
  {
    name: "find_tasks",
    label: "Checking tasks",
    description: "Search tasks (work that isn't a post, plus things clients must do) by client, owner, status, due date or title words.",
    schema: FindTasks,
    run: findTasks as ToolSpec["run"],
  },
  {
    name: "get_recent_activity",
    label: "Reading recent activity",
    description:
      "What happened recently, newest first: client approvals and change requests, comments, internal notes, client and team-only chat messages, progress updates, published posts and completed tasks.",
    schema: RecentActivity,
    run: recentActivity as ToolSpec["run"],
  },
  {
    name: "get_client_profile",
    label: "Reading the client profile",
    description:
      "One client's profile: goals, success measures, social accounts, package quotas, approval rules, this month's plan (themes, goals, key dates), brand tone, topics to avoid, FAQs, offers the client shared in the last month (sales, discounts, launches) and who is involved.",
    schema: ClientProfile,
    run: clientProfile as ToolSpec["run"],
  },
];

const BY_NAME = new Map(SPECS.map((s) => [s.name, s]));

function inputSchema(schema: z.ZodObject): Anthropic.Beta.BetaTool["input_schema"] {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json as Anthropic.Beta.BetaTool["input_schema"];
}

/** Tool definitions for the Messages API. The order is fixed so the prompt cache stays warm. */
export const ASSISTANT_TOOLS: Anthropic.Beta.BetaTool[] = SPECS.map((s) => ({
  name: s.name,
  description: s.description,
  input_schema: inputSchema(s.schema),
  eager_input_streaming: true,
}));

export function toolLabel(name: string): string {
  return BY_NAME.get(name)?.label ?? "Looking things up";
}

/** Runs one tool call. Never throws: problems come back as an error result Claude can read. */
export async function runTool(
  name: string,
  rawInput: unknown,
  data: AssistantData,
): Promise<{ content: string; isError: boolean }> {
  const spec = BY_NAME.get(name);
  if (!spec) return { content: `Unknown tool "${name}".`, isError: true };
  const parsed = spec.schema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return { content: `Invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ")}`, isError: true };
  }
  try {
    const result = await spec.run(parsed.data as never, data);
    return { content: JSON.stringify(result), isError: false };
  } catch (error) {
    if (error instanceof ToolInputError) return { content: error.message, isError: true };
    console.error(`[assistant] ${name} failed`, error);
    return { content: "The lookup failed because of a server error. Say so; don't guess the answer.", isError: true };
  }
}

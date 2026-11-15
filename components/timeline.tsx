import Link from "next/link";
import { CalendarDays, List } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TypeIcon } from "@/components/type-icon";
import { Avatar, toneDot } from "@/components/ui";
import { statusView } from "@/lib/content";
import { formatDate, formatDay, formatTime, monthGrid, planPeriod, todayKey, zonedDayKey } from "@/lib/dates";
import type { SignedMedia } from "@/lib/media";
import type { ContentItem, KeyDate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = Pick<ContentItem, "id" | "title" | "type" | "status" | "client_decision" | "planned_at"> & {
  published_at?: string | null;
  assignee_id?: string | null;
};
type Thumbs = Map<string, SignedMedia>;

/** Who each post is assigned to. Only the agency's view gets this; clients never see it. */
export type Assignments = { people: Map<string, { name: string; avatar: string | null }>; me: string };
type Assignee = { name: string; avatar: string | null; mine: boolean };

/** What every post chip needs to know. */
type Ctx = { side: "agency" | "client"; basePath: string; thumbs?: Thumbs; assign?: Assignments };

/** The day a month's plan ends, and how it's described. */
type PlanEnd = { key: string; label: string };

/** The post's first photo, if it has one (videos aren't loaded just for a preview). */
function photoOf(thumbs: Thumbs | undefined, id: string) {
  const media = thumbs?.get(id);
  return media?.kind === "image" ? media.src : null;
}

function assigneeOf(item: Item, assign?: Assignments): Assignee | null {
  if (!assign || !item.assignee_id) return null;
  const person = assign.people.get(item.assignee_id);
  if (!person) return null;
  return { name: person.name, avatar: person.avatar, mine: item.assignee_id === assign.me };
}

function assigneeText(who: Assignee) {
  return who.mine ? "Assigned to you" : `Assigned to ${who.name}`;
}

/** When a post goes on the calendar: the day it went out once published, otherwise its planned date. */
function dateOf(item: Item) {
  return item.status === "published" && item.published_at ? item.published_at : item.planned_at;
}

function groupByDay(items: Item[], tz: string) {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const at = dateOf(item);
    const key = at ? zonedDayKey(at, tz) : "unscheduled";
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  for (const list of map.values()) list.sort((a, b) => (dateOf(a) ?? "").localeCompare(dateOf(b) ?? ""));
  return map;
}

/** "19:30 PT · 09:00 LK" */
function timeOf(iso: string | null, tz: string) {
  return formatTime(iso, tz);
}

/**
 * Calendar (desktop) and day-by-day list (phones, or ?view=list) of every
 * content item by planned date, coloured by status. Each month's plan ends on
 * the 4th of the next month, so the calendar runs on to that day and marks it.
 */
export function Timeline({
  month,
  items,
  keyDates,
  tz,
  side,
  basePath,
  view,
  viewHrefs,
  thumbs,
  assign,
  emptyText = "Nothing planned for this month yet.",
}: {
  month: string;
  items: Item[];
  keyDates: KeyDate[];
  tz: string;
  side: "agency" | "client";
  basePath: string;
  view: "calendar" | "list";
  viewHrefs?: { calendar: string; list: string };
  /** Each post's first file, for the picture previews. */
  thumbs?: Thumbs;
  /** Agency only: who each post is assigned to, so people spot their own work. */
  assign?: Assignments;
  emptyText?: string;
}) {
  const byDay = groupByDay(items, tz);
  const keyDatesByDay = new Map(keyDates.map((d) => [d.date, d.label]));
  const today = todayKey(tz);
  const period = planPeriod(month);
  const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`));
  const end: PlanEnd = { key: period.end, label: `Last day of the ${monthName} plan` };
  const ctx: Ctx = { side, basePath, thumbs, assign };
  const mine = assign ? items.filter((i) => i.assignee_id === assign.me).length : 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-[13px] text-muted">
          This month runs {formatDate(period.start)} to {formatDate(period.end)}.
          {mine ? (
            <span className="ml-2 inline-flex items-center gap-1.5 whitespace-nowrap text-ink-soft">
              <span className="inline-block size-2.5 rounded-[3px] border border-accent/60 bg-accent-soft" aria-hidden />
              {mine} assigned to you
            </span>
          ) : null}
        </p>
        {viewHrefs ? (
          <div className="hidden rounded-lg border border-line bg-sunken p-0.5 text-[13px] md:inline-flex">
            <Link
              href={viewHrefs.calendar}
              scroll={false}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                view === "calendar" ? "bg-surface font-medium text-ink shadow-sm" : "text-muted",
              )}
            >
              <CalendarDays className="size-3.5" aria-hidden /> Calendar
            </Link>
            <Link
              href={viewHrefs.list}
              scroll={false}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1",
                view === "list" ? "bg-surface font-medium text-ink shadow-sm" : "text-muted",
              )}
            >
              <List className="size-3.5" aria-hidden /> List
            </Link>
          </div>
        ) : null}
      </div>

      {view === "calendar" ? (
        <div className="hidden md:block">
          <CalendarGrid month={month} byDay={byDay} keyDates={keyDatesByDay} today={today} end={end} ctx={ctx} emptyText={emptyText} />
        </div>
      ) : null}
      <div className={view === "calendar" ? "md:hidden" : undefined}>
        <AgendaList byDay={byDay} keyDates={keyDatesByDay} today={today} end={end} tz={tz} ctx={ctx} emptyText={emptyText} />
      </div>
    </div>
  );
}

/** One post on the calendar: status dot, title, and (for the agency) who it's assigned to. */
function PostChip({ item, ctx }: { item: Item; ctx: Ctx }) {
  const view = statusView(item, ctx.side);
  const photo = photoOf(ctx.thumbs, item.id);
  const who = assigneeOf(item, ctx.assign);
  return (
    <Link
      href={`${ctx.basePath}/content/${item.id}`}
      className={cn(
        "group/chip relative flex items-center gap-1.5 rounded-md border px-1.5 py-1 text-[11.5px] leading-tight text-ink hover:z-30 hover:shadow-sm focus-visible:z-30",
        who?.mine ? "border-accent/50 bg-accent-soft hover:border-accent" : "border-line bg-surface hover:border-line-strong",
      )}
      title={photo ? undefined : [item.title, view.label, who ? assigneeText(who) : null].filter(Boolean).join(" · ")}
    >
      <span className={cn("size-2 shrink-0 rounded-full", toneDot[view.tone])} aria-hidden />
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {who ? (
        <>
          <Avatar name={who.name} src={who.avatar} size="xs" className={who.mine ? "ring-1 ring-accent" : undefined} />
          <span className="sr-only">{assigneeText(who)}</span>
        </>
      ) : null}
      {photo ? (
        <span
          aria-hidden
          className="print-card pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 -ml-[76px] block w-[152px] rounded-lg border border-line bg-surface p-1.5 shadow-[0_24px_40px_-18px_rgb(29_27_22/0.45)]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
          <img src={photo} alt="" loading="lazy" decoding="async" className="aspect-[4/5] w-full rounded-md bg-sunken object-cover" />
          <span className="mt-1.5 line-clamp-2 block px-0.5 text-[11.5px] leading-snug font-medium whitespace-normal text-ink">{item.title}</span>
          <span className="mb-0.5 block px-0.5 text-[10.5px] text-muted">
            {view.label}
            {who ? ` · ${who.mine ? "Yours" : who.name}` : ""}
          </span>
        </span>
      ) : null}
    </Link>
  );
}

function CalendarGrid({
  month,
  byDay,
  keyDates,
  today,
  end,
  ctx,
  emptyText,
}: {
  month: string;
  byDay: Map<string, Item[]>;
  keyDates: Map<string, string>;
  today: string;
  end: PlanEnd;
  ctx: Ctx;
  emptyText: string;
}) {
  const days = monthGrid(month, end.key);
  const onGrid = new Set(days.map((d) => d.key));
  const undated = byDay.get("unscheduled") ?? [];
  const elsewhere = [...byDay.entries()].filter(([key]) => key !== "unscheduled" && !onGrid.has(key)).flatMap(([, list]) => list);
  return (
    <div className="space-y-3">
      {/* Not overflow-hidden: the picture previews rise above the grid. */}
      <div className="rounded-xl border border-line">
        <div className="grid grid-cols-7 rounded-t-xl border-b border-line bg-sunken text-center text-xs font-medium text-muted">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, i) => {
            const items = byDay.get(day.key) ?? [];
            const keyDate = keyDates.get(day.key);
            const isEnd = day.key === end.key;
            // The first days of next month, up to the 4th, are still part of this month's plan.
            const inPlan = day.inMonth || (day.key > month && day.key <= end.key);
            return (
              <div
                key={day.key}
                className={cn(
                  "min-h-28 border-line p-1.5",
                  i % 7 !== 6 && "border-r",
                  i < days.length - 7 && "border-b",
                  i === days.length - 7 && "rounded-bl-xl",
                  i === days.length - 1 && "rounded-br-xl",
                  !inPlan && "bg-sunken/60",
                )}
              >
                <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                  <span
                    className={cn(
                      "inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs tabular-nums",
                      day.key === today ? "bg-accent font-semibold text-white" : inPlan ? "text-ink-soft" : "text-faint",
                    )}
                  >
                    {day.day}
                  </span>
                  {keyDate || isEnd ? (
                    <span className="flex min-w-0 items-center gap-1">
                      {keyDate ? (
                        <span className="truncate rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900" title={keyDate}>
                          {keyDate}
                        </span>
                      ) : null}
                      {isEnd ? (
                        <span className="shrink-0 rounded bg-ink px-1 text-[10px] font-medium text-white" title={end.label}>
                          Month ends
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {items.map((item) => (
                    <li key={item.id}>
                      <PostChip item={item} ctx={ctx} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
      {byDay.size ? null : <p className="text-[13px] text-muted">{emptyText}</p>}
      {undated.length || elsewhere.length ? (
        <div className="rounded-xl border border-line bg-surface p-3">
          {undated.length ? <ExtraRow label="No date yet" items={undated} ctx={ctx} /> : null}
          {elsewhere.length ? <ExtraRow label="Other months" items={elsewhere} ctx={ctx} className={undated.length ? "mt-3" : undefined} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Posts that don't fit on the month grid, as a row of the same chips. */
function ExtraRow({ label, items, ctx, className }: { label: string; items: Item[]; ctx: Ctx; className?: string }) {
  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-medium text-muted">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="max-w-56">
            <PostChip item={item} ctx={ctx} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function AgendaList({
  byDay,
  keyDates,
  today,
  end,
  tz,
  ctx,
  emptyText,
}: {
  byDay: Map<string, Item[]>;
  keyDates: Map<string, string>;
  today: string;
  end: PlanEnd;
  tz: string;
  ctx: Ctx;
  emptyText: string;
}) {
  const keys = [...new Set([...byDay.keys(), ...keyDates.keys(), end.key])].filter((k) => k !== "unscheduled").sort();
  if (byDay.has("unscheduled")) keys.push("unscheduled");

  return (
    <div>
      {byDay.size ? null : <p className="py-4 text-center text-sm text-muted">{emptyText}</p>}
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {keys.map((key) => (
          <li key={key} className="px-3 py-2.5 sm:px-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className={cn("font-semibold", key === today ? "text-accent" : "text-ink")}>
                {key === "unscheduled" ? "No date yet" : formatDay(key)}
                {key === today ? " · Today" : ""}
              </span>
              {keyDates.get(key) ? (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{keyDates.get(key)}</span>
              ) : null}
              {key === end.key ? <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">{end.label}</span> : null}
            </div>
            {byDay.get(key)?.length ? (
              <ul className="mt-1.5 space-y-1">
                {byDay.get(key)!.map((item) => {
                  const photo = photoOf(ctx.thumbs, item.id);
                  const who = assigneeOf(item, ctx.assign);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`${ctx.basePath}/content/${item.id}`}
                        className={cn("-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5", who?.mine ? "bg-accent-soft" : "hover:bg-sunken")}
                      >
                        {/* Wraps onto two lines on phones, so the title keeps its room. */}
                        <span className="w-[4.6rem] shrink-0 text-xs leading-tight tabular-nums text-muted sm:w-auto">{timeOf(dateOf(item), tz)}</span>
                        {photo ? (
                          // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                          <img
                            src={photo}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="size-9 shrink-0 rounded-md border border-line bg-sunken object-cover shadow-[0_2px_6px_-2px_rgb(29_27_22/0.25)]"
                          />
                        ) : (
                          <TypeIcon type={item.type} className="text-muted" />
                        )}
                        <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-ink">{item.title}</span>
                        {who ? (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted" title={assigneeText(who)}>
                            <Avatar name={who.name} src={who.avatar} size="xs" className={who.mine ? "ring-1 ring-accent" : undefined} />
                            <span aria-hidden className={cn("hidden sm:inline", who.mine && "font-medium text-accent-ink")}>
                              {who.mine ? "You" : who.name.split(" ")[0]}
                            </span>
                            <span className="sr-only">{assigneeText(who)}</span>
                          </span>
                        ) : null}
                        <StatusBadge item={item} side={ctx.side} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

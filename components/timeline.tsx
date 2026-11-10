import Link from "next/link";
import { CalendarDays, List } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TypeIcon } from "@/components/type-icon";
import { toneDot } from "@/components/ui";
import { statusView } from "@/lib/content";
import { formatDay, formatTime, monthGrid, todayKey, zonedDayKey } from "@/lib/dates";
import type { ContentItem, KeyDate } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = Pick<ContentItem, "id" | "title" | "type" | "status" | "client_decision" | "planned_at">;

function groupByDay(items: Item[], tz: string) {
  const map = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.planned_at ? zonedDayKey(item.planned_at, tz) : "unscheduled";
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  for (const list of map.values()) list.sort((a, b) => (a.planned_at ?? "").localeCompare(b.planned_at ?? ""));
  return map;
}

/** "19:30 PT · 09:00 LK" */
function timeOf(iso: string | null, tz: string) {
  return formatTime(iso, tz);
}

/**
 * Calendar (desktop) and day-by-day list (phones, or ?view=list) of every
 * content item by planned date, coloured by status.
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
}: {
  month: string;
  items: Item[];
  keyDates: KeyDate[];
  tz: string;
  side: "agency" | "client";
  basePath: string;
  view: "calendar" | "list";
  viewHrefs?: { calendar: string; list: string };
}) {
  const byDay = groupByDay(items, tz);
  const keyDatesByDay = new Map(keyDates.map((d) => [d.date, d.label]));
  const today = todayKey(tz);

  return (
    <div>
      {viewHrefs ? (
        <div className="mb-3 hidden justify-end md:flex">
          <div className="inline-flex rounded-lg border border-line bg-sunken p-0.5 text-[13px]">
            <Link
              href={viewHrefs.calendar}
              scroll={false}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1", view === "calendar" ? "bg-surface font-medium text-ink shadow-sm" : "text-muted")}
            >
              <CalendarDays className="size-3.5" aria-hidden /> Calendar
            </Link>
            <Link
              href={viewHrefs.list}
              scroll={false}
              className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1", view === "list" ? "bg-surface font-medium text-ink shadow-sm" : "text-muted")}
            >
              <List className="size-3.5" aria-hidden /> List
            </Link>
          </div>
        </div>
      ) : null}

      {view === "calendar" ? (
        <div className="hidden md:block">
          <CalendarGrid month={month} byDay={byDay} keyDates={keyDatesByDay} today={today} side={side} basePath={basePath} />
        </div>
      ) : null}
      <div className={view === "calendar" ? "md:hidden" : undefined}>
        <AgendaList byDay={byDay} keyDates={keyDatesByDay} today={today} side={side} basePath={basePath} tz={tz} />
      </div>
    </div>
  );
}

function CalendarGrid({
  month,
  byDay,
  keyDates,
  today,
  side,
  basePath,
}: {
  month: string;
  byDay: Map<string, Item[]>;
  keyDates: Map<string, string>;
  today: string;
  side: "agency" | "client";
  basePath: string;
}) {
  const days = monthGrid(month);
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-sunken text-center text-xs font-medium text-muted">
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
          return (
            <div
              key={day.key}
              className={cn(
                "min-h-28 border-line p-1.5",
                i % 7 !== 6 && "border-r",
                i < days.length - 7 && "border-b",
                !day.inMonth && "bg-sunken/60",
              )}
            >
              <div className="mb-1 flex items-center justify-between gap-1 px-0.5">
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    day.key === today ? "bg-accent font-semibold text-white" : day.inMonth ? "text-ink-soft" : "text-faint",
                  )}
                >
                  {day.day}
                </span>
                {keyDate ? (
                  <span className="truncate rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-900" title={keyDate}>
                    {keyDate}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-1">
                {items.map((item) => {
                  const view = statusView(item, side);
                  return (
                    <li key={item.id}>
                      <Link
                        href={`${basePath}/content/${item.id}`}
                        className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-1.5 py-1 text-[11.5px] leading-tight text-ink hover:border-line-strong hover:shadow-sm"
                        title={`${item.title} · ${view.label}`}
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", toneDot[view.tone])} aria-hidden />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaList({
  byDay,
  keyDates,
  today,
  side,
  basePath,
  tz,
}: {
  byDay: Map<string, Item[]>;
  keyDates: Map<string, string>;
  today: string;
  side: "agency" | "client";
  basePath: string;
  tz: string;
}) {
  const keys = [...new Set([...byDay.keys(), ...keyDates.keys()])].filter((k) => k !== "unscheduled").sort();
  if (byDay.has("unscheduled")) keys.push("unscheduled");
  if (!keys.length) return <p className="py-6 text-center text-sm text-muted">Nothing planned for this month yet.</p>;

  return (
    <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
      {keys.map((key) => (
        <li key={key} className="px-3 py-2.5 sm:px-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-2 text-[13px]">
            <span className={cn("font-semibold", key === today ? "text-accent" : "text-ink")}>
              {key === "unscheduled" ? "No date yet" : formatDay(key)}
              {key === today ? " · Today" : ""}
            </span>
            {keyDates.get(key) ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{keyDates.get(key)}</span>
            ) : null}
          </div>
          <ul className="space-y-1">
            {(byDay.get(key) ?? []).map((item) => (
              <li key={item.id}>
                <Link
                  href={`${basePath}/content/${item.id}`}
                  className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-sunken"
                >
                  <span className="shrink-0 text-xs tabular-nums text-muted">{timeOf(item.planned_at, tz)}</span>
                  <TypeIcon type={item.type} className="text-muted" />
                  <span className="line-clamp-2 min-w-0 flex-1 text-sm leading-snug text-ink">{item.title}</span>
                  <StatusBadge item={item} side={side} />
                </Link>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

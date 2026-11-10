/**
 * Time-zone helpers. Planned dates are stored in UTC and shown in each
 * client's time zone, so the calendar matches what the client sees locally.
 */

function partsInTz(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour") % 24,
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMs(date: Date, tz: string) {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-14T09:30" in the client's zone -> UTC ISO string. */
export function zonedInputToIso(local: string, tz: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/.exec(local.trim());
  if (!match) return null;
  const [, y, m, d, h = "09", mi = "00"] = match;
  const guess = Date.UTC(+y, +m - 1, +d, +h, +mi);
  const first = offsetMs(new Date(guess), tz);
  let ts = guess - first;
  const second = offsetMs(new Date(ts), tz);
  if (second !== first) ts = guess - second;
  return new Date(ts).toISOString();
}

/** UTC ISO -> "2026-11-14T09:30" in the client's zone (for datetime-local inputs). */
export function isoToZonedInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return "";
  const p = partsInTz(new Date(iso), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC ISO -> "2026-11-14" in the client's zone (for grouping by day). */
export function zonedDayKey(iso: string, tz: string): string {
  const p = partsInTz(new Date(iso), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function todayKey(tz: string): string {
  return zonedDayKey(new Date().toISOString(), tz);
}

/** "2026-11" for the current month in the client's zone. */
export function currentMonth(tz: string): string {
  return todayKey(tz).slice(0, 7);
}

export function isMonthParam(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Days of the month grid (Monday first), including leading/trailing days. */
export function monthGrid(month: string): { key: string; day: number; inMonth: boolean }[] {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const total = Math.ceil((lead + daysInMonth) / 7) * 7;
  return Array.from({ length: total }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1, 1 - lead + i));
    return {
      key: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
    };
  });
}

export function formatDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "No date set";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, tz = "UTC"): string {
  if (!iso) return "";
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso;
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "numeric", month: "short" }).format(new Date(value));
}

export function formatDay(key: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    new Date(`${key}T12:00:00Z`),
  );
}

export function timeAgo(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Default approval deadline: two days before the planned date, but at least a day from now. */
export function defaultApprovalDeadline(plannedAt: string | null): string {
  const now = Date.now();
  const minimum = now + 86_400_000;
  const fromPlan = plannedAt ? new Date(plannedAt).getTime() - 2 * 86_400_000 : now + 2 * 86_400_000;
  return new Date(Math.max(minimum, fromPlan)).toISOString();
}

/** Positive: days until; negative: days overdue. */
export function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

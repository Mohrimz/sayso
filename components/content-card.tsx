import Link from "next/link";
import { Clock } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { TypeIcon } from "@/components/type-icon";
import { CONTENT_TYPES } from "@/lib/content";
import { daysUntil, formatDateTime } from "@/lib/dates";
import type { SignedMedia } from "@/lib/media";
import type { ContentItem } from "@/lib/types";
import { cn } from "@/lib/utils";

type Item = Pick<ContentItem, "id" | "title" | "type" | "status" | "client_decision" | "planned_at" | "approval_deadline">;

export function Thumb({ media, type, className }: { media?: SignedMedia; type: ContentItem["type"]; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-lg bg-sunken", className)}>
      {media?.kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={media.src}
          alt=""
          className="h-full w-full object-cover transition-[scale] duration-700 ease-out-expo group-hover:scale-[1.05]"
          loading="lazy"
        />
      ) : media?.kind === "video" ? (
        <video src={media.src} muted playsInline preload="metadata" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-faint">
          <TypeIcon type={type} className="size-5" />
        </div>
      )}
    </div>
  );
}

export function DeadlineText({ iso, tz }: { iso: string | null; tz: string }) {
  if (!iso) return null;
  const days = daysUntil(iso);
  const overdue = days < 0;
  return (
    <span
      className={cn("inline-flex items-center gap-1", overdue ? "font-medium text-danger" : days <= 1 ? "font-medium text-orange-700" : "text-muted")}
    >
      <Clock className="size-3" aria-hidden />
      {overdue
        ? `Overdue since ${formatDateTime(iso, tz)}`
        : days === 0
          ? "Due today"
          : days === 1
            ? "Due tomorrow"
            : `Due ${formatDateTime(iso, tz)}`}
    </span>
  );
}

/** Large card for the approval queue (client home). */
export function ApprovalCard({
  item,
  media,
  href,
  tz,
  side,
}: {
  item: Item;
  media?: SignedMedia;
  href: string;
  tz: string;
  side: "agency" | "client";
}) {
  return (
    <Link href={href} data-tilt="5" className="lift group relative flex gap-3 rounded-xl border border-line bg-surface p-3">
      <Thumb media={media} type={item.type} className="aspect-[4/5] w-20 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="line-clamp-2 text-sm font-medium text-ink group-hover:underline">{item.title}</p>
        <p className="mt-0.5 text-xs text-muted">
          {CONTENT_TYPES[item.type].label} · {formatDateTime(item.planned_at, tz)}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2 text-xs">
          <StatusBadge item={item} side={side} />
          <DeadlineText iso={item.approval_deadline} tz={tz} />
        </div>
      </div>
    </Link>
  );
}

/** Compact row used in lists. */
export function ContentRow({ item, href, tz, side }: { item: Item; href: string; tz: string; side: "agency" | "client" }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-sunken sm:px-5">
      <TypeIcon type={item.type} className="text-muted" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-ink">{item.title}</span>
        <span className="block text-xs text-muted">{formatDateTime(item.planned_at, tz)}</span>
      </span>
      <StatusBadge item={item} side={side} />
    </Link>
  );
}

import { AGENCY_TIME_ZONE, formatDateTime, timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

export { AGENCY_TIME_ZONE };
const ACTIVE_FOR_MS = 5 * 60 * 1000;

function activeNow(iso: string) {
  return Date.now() - new Date(iso).getTime() < ACTIVE_FOR_MS;
}

/** "Active now", "Last seen 2h ago" (exact time on hover), or "Hasn't signed in yet". */
export function SeenStatus({ iso, className }: { iso: string | null; className?: string }) {
  if (!iso) {
    return <span className={cn("inline-flex items-center gap-1.5 text-xs text-faint", className)}>Hasn&apos;t signed in yet</span>;
  }
  const exact = formatDateTime(iso);
  if (activeNow(iso)) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700", className)} title={`Last seen ${exact}`}>
        <span className="relative flex size-2" aria-hidden>
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500/60 motion-reduce:animate-none" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        Active now
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-faint", className)}>
      <span className="size-2 rounded-full bg-line-strong" aria-hidden />
      Last seen{" "}
      <time dateTime={iso} title={exact} className="text-muted">
        {timeAgo(iso)}
      </time>
    </span>
  );
}

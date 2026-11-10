import { deliverables, deliverableSummary } from "@/lib/content";
import type { ContentItem, Quotas } from "@/lib/types";

/** Live counters per quota: published, ready, awaiting approval, in progress. */
export function Deliverables({ items, quotas }: { items: Pick<ContentItem, "type" | "status">[]; quotas: Quotas }) {
  const rows = deliverables(items, quotas);
  if (!rows.length) return <p className="text-sm text-muted">No quotas set for this package.</p>;

  return (
    <ul className="space-y-4">
      {rows.map((row) => {
        const scale = Math.max(row.quota, row.total, 1);
        const pct = (n: number) => `${(n / scale) * 100}%`;
        const over = row.total > row.quota && row.quota > 0;
        return (
          <li key={row.key}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-ink">{row.label}</span>
              <span className="text-sm tabular-nums text-ink">
                <span className="font-semibold">{row.published}</span>
                <span className="text-muted"> / {row.quota} published</span>
              </span>
            </div>
            <div
              className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-sunken"
              role="img"
              aria-label={`${row.label}: ${deliverableSummary(row)}`}
            >
              <span className="h-full bg-emerald-700" style={{ width: pct(row.published) }} />
              <span className="h-full bg-green-500" style={{ width: pct(row.ready) }} />
              <span className="h-full bg-blue-500" style={{ width: pct(row.awaiting) }} />
              <span className="h-full bg-amber-300" style={{ width: pct(row.inProgress) }} />
            </div>
            <p className="mt-1 text-xs text-muted">
              {deliverableSummary(row)}
              {over ? ` · ${row.total - row.quota} over the package` : ""}
              {row.quota > row.total ? ` · ${row.quota - row.total} not planned yet` : ""}
            </p>
          </li>
        );
      })}
      <li className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted">
        <Legend className="bg-emerald-700" label="Published" />
        <Legend className="bg-green-500" label="Approved or scheduled" />
        <Legend className="bg-blue-500" label="Awaiting approval" />
        <Legend className="bg-amber-300" label="In progress" />
      </li>
    </ul>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${className}`} aria-hidden />
      {label}
    </span>
  );
}

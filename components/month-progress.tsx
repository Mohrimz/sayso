import { AnimatedBar, AnimatedNumber } from "@/components/anim";
import { deliverables, deliverableSummary } from "@/lib/content";
import type { ContentItem, Quotas } from "@/lib/types";

/** One overall bar ("7 of 24 published") plus a small line per content type. */
export function MonthProgress({ items, quotas }: { items: Pick<ContentItem, "type" | "status">[]; quotas: Quotas }) {
  const rows = deliverables(items, quotas);
  if (!rows.length) return <p className="text-sm text-muted">No quotas set for this package.</p>;
  const sum = (k: "quota" | "published" | "ready" | "awaiting" | "inProgress") => rows.reduce((n, r) => n + r[k], 0);
  const quota = Math.max(sum("quota"), 1);
  const pct = (n: number) => (n / quota) * 100;

  return (
    <div>
      <div className="flex items-baseline gap-2">
        <AnimatedNumber value={sum("published")} className="text-3xl font-semibold tracking-tight" />
        <span className="text-sm text-muted">of {sum("quota")} posts published</span>
      </div>
      <AnimatedBar
        className="mt-3 h-3"
        label={`${sum("published")} published, ${sum("ready")} ready, ${sum("awaiting")} awaiting approval, ${sum("inProgress")} in progress`}
        segments={[
          { value: pct(sum("published")), className: "bg-emerald-600" },
          { value: pct(sum("ready")), className: "bg-green-400" },
          { value: pct(sum("awaiting")), className: "bg-blue-500" },
          { value: pct(sum("inProgress")), className: "bg-amber-300" },
        ]}
      />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <Legend dot="bg-emerald-600" label={`${sum("published")} published`} />
        <Legend dot="bg-green-400" label={`${sum("ready")} ready`} />
        <Legend dot="bg-blue-500" label={`${sum("awaiting")} awaiting approval`} />
        <Legend dot="bg-amber-300" label={`${sum("inProgress")} in progress`} />
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-2">
        {rows.map((r) => (
          <li key={r.key} className="min-w-0 rounded-xl bg-sunken/70 px-3 py-2.5" title={deliverableSummary(r)}>
            <p className="text-xs text-muted">{r.label}</p>
            <p className="mt-0.5 text-sm font-semibold text-ink tabular-nums">
              {r.published} <span className="font-normal text-muted">/ {r.quota}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`size-2 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

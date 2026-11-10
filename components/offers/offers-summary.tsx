import Link from "next/link";
import { ArrowRight, BadgePercent } from "lucide-react";
import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { timeAgo } from "@/lib/dates";
import { offerPreview } from "@/lib/offers";

export type OfferSummaryRow = {
  id: string;
  message: string;
  createdAt: string;
  href: string;
  /** Shown on the agency dashboard, where offers from every client are listed. */
  client?: string;
};

/** A short list of recently shared offers, linking to each one. */
export function OffersSummary({ title = "Offers", rows, allHref, more = 0 }: { title?: string; rows: OfferSummaryRow[]; allHref?: string; more?: number }) {
  if (!rows.length) return null;
  return (
    <Card>
      <CardHeader
        title={title}
        action={
          allHref ? (
            <ButtonLink href={allHref} size="sm" variant="ghost">
              {more ? `See all ${rows.length + more}` : "See all"} <ArrowRight className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : null
        }
      />
      <ul className="divide-y divide-line">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={o.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-sunken sm:px-5">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <BadgePercent className="size-[18px]" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{offerPreview(o.message, 90)}</span>
                <span className="block truncate text-xs text-muted">{[o.client, timeAgo(o.createdAt)].filter(Boolean).join(" · ")}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

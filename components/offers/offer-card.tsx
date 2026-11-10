import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { formatDateTime } from "@/lib/dates";
import type { OfferView } from "@/lib/offers";
import { RemoveOfferButton } from "@/components/offers/remove-offer-button";

/** One shared offer: the client's message, who shared it and when. */
export function OfferCard({ offer, timeZone, planHref }: { offer: OfferView; timeZone: string; planHref?: string }) {
  return (
    <article id={`offer-${offer.id}`} className="scroll-mt-24 rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] target:border-accent target:ring-2 target:ring-accent/20 sm:p-5">
      <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-ink break-words">{offer.message}</p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <p className="text-xs text-muted">
          {offer.authorName} · <time dateTime={offer.createdAt}>{formatDateTime(offer.createdAt, timeZone)}</time>
        </p>
        <div className="flex items-center gap-1">
          {planHref ? (
            <Link href={planHref} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-accent-ink hover:bg-sunken">
              <CalendarPlus className="size-3.5" aria-hidden /> Plan a post
            </Link>
          ) : null}
          {offer.canRemove ? <RemoveOfferButton offerId={offer.id} /> : null}
        </div>
      </div>
    </article>
  );
}

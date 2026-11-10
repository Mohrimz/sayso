import type { Metadata } from "next";
import { getWorkspaceAccess } from "@/lib/auth";
import { getOffers } from "@/lib/offers-data";
import { todayKey } from "@/lib/dates";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { OfferCard } from "@/components/offers/offer-card";
import { OfferComposer } from "@/components/offers/offer-form";
import { RealtimeRefresh } from "@/components/realtime-refresh";

export const metadata: Metadata = { title: "Offers" };

/**
 * Offers the client shares with the agency: one message each, like an
 * announcement. Only the client side can post (also enforced in the database);
 * the agency team gets a notification and plans posts around them.
 */
export default async function OffersPage({ params }: PageProps<"/w/[slug]/offers">) {
  const { slug } = await params;
  const { workspace, viewer, can } = await getWorkspaceAccess(slug);
  const offers = await getOffers(workspace, viewer);
  const today = todayKey(workspace.time_zone);
  const planHref = can.isAgency ? `/w/${workspace.slug}/content/new?month=${today.slice(0, 7)}&date=${today}` : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <RealtimeRefresh channel={`offers:${workspace.id}`} watch={[{ table: "offers", filter: `workspace_id=eq.${workspace.id}` }]} />

      <PageHeader
        title="Offers"
        description={
          can.isClient
            ? "Running a sale, a discount or a launch? Tell the team here and they'll plan posts around it."
            : `Offers and announcements from ${workspace.name}. You get a notification for each one.`
        }
      />

      {can.isClient ? <OfferComposer workspaceId={workspace.id} /> : null}

      {offers.length ? (
        <section aria-labelledby="offers-shared" className="space-y-3">
          <h2 id="offers-shared" className="text-base font-semibold text-ink">
            {can.isClient ? "Shared with the team" : "From the client"}{" "}
            <span className="ml-1 text-sm font-normal text-muted tabular-nums">{offers.length}</span>
          </h2>
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} timeZone={workspace.time_zone} planHref={planHref} />
          ))}
        </section>
      ) : (
        <Card>
          <EmptyState title={can.isClient ? "Nothing shared yet" : `No offers from ${workspace.name} yet`}>
            {can.isClient
              ? "When you have a sale, a discount or a launch coming up, write it above. The team is told straight away."
              : "When they share an offer, it shows here and you get a notification."}
          </EmptyState>
        </Card>
      )}
    </div>
  );
}

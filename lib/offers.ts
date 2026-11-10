/**
 * Client offers: short announcements the client posts for the agency (a sale,
 * a discount, a launch), so the team can plan posts around them. Shared by the
 * Offers page, the overview cards, the dashboard and the actions.
 */

export const OFFER_MAX_LENGTH = 2000;

/** How far back the overview cards, the dashboard and the assistant look. */
export const RECENT_OFFER_DAYS = 30;

export type OfferView = {
  id: string;
  message: string;
  createdBy: string | null;
  authorName: string;
  createdAt: string;
  /** Only the person who posted it can take it down. */
  canRemove: boolean;
};

/** The message on one line, shortened for lists and notifications. */
export function offerPreview(message: string, max = 140): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/** ISO time `days` ago, for "recent offers" queries. */
export function recentOfferSince(days = RECENT_OFFER_DAYS): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

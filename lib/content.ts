import type { ContentItem, ContentStatus, ContentType, Quotas } from "@/lib/types";

export type Tone = "gray" | "amber" | "orange" | "purple" | "blue" | "green" | "teal" | "emerald";

export const CONTENT_TYPES: Record<ContentType, { label: string; quota: keyof Quotas }> = {
  feed_post: { label: "Feed post", quota: "feed_post" },
  carousel: { label: "Carousel", quota: "feed_post" },
  reel: { label: "Reel", quota: "reel" },
  story: { label: "Story", quota: "story" },
};

export const QUOTA_LABELS: Record<keyof Quotas, string> = {
  feed_post: "Feed posts",
  reel: "Reels",
  story: "Stories",
  report: "Monthly report",
};

export const PLATFORMS = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "x", label: "X" },
  { id: "youtube", label: "YouTube" },
] as const;

export function platformLabel(id: string) {
  return PLATFORMS.find((p) => p.id === id)?.label ?? id;
}

type StatusInput = Pick<ContentItem, "status" | "client_decision">;

/**
 * The label shown for an item. Clients never see the internal review step:
 * Draft and Internal review both read as "In progress" for them.
 */
export function statusView(item: StatusInput, side: "agency" | "client"): { label: string; tone: Tone } {
  const revising = item.status === "draft" && item.client_decision === "changes_requested";
  switch (item.status) {
    case "planned":
      return { label: "Planned", tone: "gray" };
    case "draft":
      if (revising) return { label: side === "agency" ? "Changes requested" : "Revising", tone: "orange" };
      return { label: side === "agency" ? "Draft" : "In progress", tone: "amber" };
    case "internal_review":
      return side === "agency" ? { label: "Internal review", tone: "purple" } : { label: "In progress", tone: "amber" };
    case "client_review":
      return { label: "Awaiting approval", tone: "blue" };
    case "approved":
      return { label: "Approved", tone: "green" };
    case "scheduled":
      return { label: "Scheduled", tone: "teal" };
    case "published":
      return { label: "Published", tone: "emerald" };
  }
}

export const STATUS_ORDER: ContentStatus[] = [
  "planned",
  "draft",
  "internal_review",
  "client_review",
  "approved",
  "scheduled",
  "published",
];

export type DeliverableRow = {
  key: keyof Quotas;
  label: string;
  quota: number;
  published: number;
  ready: number; // approved or scheduled
  awaiting: number; // waiting for the client
  inProgress: number; // planned, draft, internal review
  total: number;
};

/** "Feed posts: 7 of 12 published, 3 awaiting approval, 2 in progress". */
export function deliverables(items: Pick<ContentItem, "type" | "status">[], quotas: Quotas): DeliverableRow[] {
  const keys: (keyof Quotas)[] = ["feed_post", "reel", "story"];
  return keys
    .map((key) => {
      const ofType = items.filter((i) => CONTENT_TYPES[i.type].quota === key);
      const count = (statuses: ContentStatus[]) => ofType.filter((i) => statuses.includes(i.status)).length;
      return {
        key,
        label: QUOTA_LABELS[key],
        quota: Number(quotas[key] ?? 0),
        published: count(["published"]),
        ready: count(["approved", "scheduled"]),
        awaiting: count(["client_review"]),
        inProgress: count(["planned", "draft", "internal_review"]),
        total: ofType.length,
      };
    })
    .filter((row) => row.quota > 0 || row.total > 0);
}

export function deliverableSummary(row: DeliverableRow): string {
  const parts = [`${row.published} of ${row.quota} published`];
  if (row.ready) parts.push(`${row.ready} ready to go`);
  if (row.awaiting) parts.push(`${row.awaiting} awaiting approval`);
  if (row.inProgress) parts.push(`${row.inProgress} in progress`);
  return parts.join(", ");
}

export function captionFor(captions: unknown, platform?: string): string {
  const map = captions && typeof captions === "object" ? (captions as Record<string, string>) : {};
  return (platform && map[platform]) || map.default || "";
}

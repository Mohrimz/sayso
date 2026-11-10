import { Badge } from "@/components/ui";
import { statusView } from "@/lib/content";
import type { ContentItem } from "@/lib/types";

export function StatusBadge({
  item,
  side,
  className,
}: {
  item: Pick<ContentItem, "status" | "client_decision">;
  side: "agency" | "client";
  className?: string;
}) {
  const view = statusView(item, side);
  return (
    <Badge tone={view.tone} className={className}>
      {view.label}
    </Badge>
  );
}

import { Film, Image as ImageIcon, Images, Smartphone } from "lucide-react";
import type { ContentType } from "@/lib/types";
import { CONTENT_TYPES } from "@/lib/content";
import { cn } from "@/lib/utils";

const ICONS = { feed_post: ImageIcon, carousel: Images, reel: Film, story: Smartphone } as const;

export function TypeIcon({ type, className }: { type: ContentType; className?: string }) {
  const Icon = ICONS[type];
  return <Icon className={cn("size-4 shrink-0", className)} aria-label={CONTENT_TYPES[type].label} />;
}

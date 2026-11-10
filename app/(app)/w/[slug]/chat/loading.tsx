import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui";
import { ChatFrame } from "@/components/chat/chat-frame";

/** Chat-shaped placeholder; like the other skeletons it blurs away when the chat arrives. */
export default function Loading() {
  return (
    <ViewTransition exit="vt-out" default="none">
      <ChatFrame busy fill>
        <Skeleton className="mb-3 h-8 w-28" />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface" aria-label="Loading chat">
          <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
          <div className="flex-1 space-y-4 p-5">
            <Skeleton className="h-10 w-2/3 rounded-2xl" />
            <Skeleton className="ml-auto h-10 w-1/2 rounded-2xl" />
            <Skeleton className="h-16 w-3/5 rounded-2xl" />
          </div>
          <div className="border-t border-line p-3">
            <Skeleton className="h-12 rounded-2xl" />
          </div>
        </div>
      </ChatFrame>
    </ViewTransition>
  );
}

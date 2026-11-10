import type { CSSProperties, ReactNode } from "react";

/**
 * Sizes the chat to fill the screen between the top bar and the bottom tab
 * bar, so the message list scrolls instead of the page. The negative bottom
 * margin cancels the extra padding <main> keeps for other pages.
 *
 * Phones and tablets: 56px top bar + 20px padding + ~56px tab bar + 12px gap.
 * Desktop: 56px top bar + 32px padding + 24px gap.
 */
export function ChatFrame({ children, busy = false }: { children: ReactNode; busy?: boolean }) {
  return (
    <div
      aria-busy={busy || undefined}
      className="flex h-[calc(100dvh-144px-var(--safe-bottom))] min-h-[420px] flex-col mb-[calc(var(--safe-bottom)-44px)] lg:mb-[-40px] lg:h-[calc(100dvh-112px)] lg:min-h-[480px]"
      style={{ "--safe-bottom": "env(safe-area-inset-bottom, 0px)" } as CSSProperties}
    >
      {children}
    </div>
  );
}

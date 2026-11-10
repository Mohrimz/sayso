"use client";

import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { Dialog } from "radix-ui";
import { Pencil, Plus, Settings2, X } from "lucide-react";
import { buttonClass } from "@/components/ui";

const SheetContext = createContext<{ close: () => void } | null>(null);

/** Forms inside a sheet use this to close it after a successful save. */
export function useSheet() {
  return useContext(SheetContext);
}

const ICONS = { plus: Plus, pencil: Pencil, settings: Settings2 } as const;

const noopSubscribe = () => () => {};

/**
 * A panel that slides in from the right on desktop and up from the bottom on
 * phones. Keeps long forms out of the page until they're needed.
 */
export function Sheet({
  title,
  description,
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "sm",
  icon,
  children,
  className,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost";
  triggerSize?: "sm" | "md";
  icon?: keyof typeof ICONS;
  children: ReactNode;
  className?: string;
  /** Opens straight away, e.g. when a notification links to it. */
  defaultOpen?: boolean;
}) {
  // `defaultOpen` only takes effect once the page has hydrated: a modal that is
  // open on the first render hides the rest of the page (aria-hidden) while
  // React is still hydrating it, which causes a hydration mismatch.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? (defaultOpen && hydrated);
  const Icon = icon ? ICONS[icon] : null;
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger className={buttonClass(triggerVariant, triggerSize, className)}>
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        {triggerLabel}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[2px] data-[state=closed]:animate-[overlay-out_180ms_ease-in] data-[state=open]:animate-[overlay-in_200ms_ease-out]" />
        <Dialog.Content
          className="fold-right fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-surface shadow-2xl outline-none data-[state=closed]:animate-[sheet-out-bottom_200ms_ease-in] data-[state=open]:animate-[sheet-in-bottom_300ms_cubic-bezier(0.2,0.8,0.2,1)] sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[min(600px,100vw)] sm:rounded-none sm:rounded-l-2xl sm:data-[state=closed]:animate-[sheet-out-right_200ms_ease-in] sm:data-[state=open]:animate-[sheet-in-right_300ms_cubic-bezier(0.2,0.8,0.2,1)]"
        >
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-ink">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-muted">{description}</Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="-mr-2 inline-flex size-9 items-center justify-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            <SheetContext value={{ close: () => setOpen(false) }}>{children}</SheetContext>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

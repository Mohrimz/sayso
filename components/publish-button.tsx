"use client";

import { useActionState, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Info, Send } from "lucide-react";
import { toast } from "sonner";
import { publishNow } from "@/app/actions/publish";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

/**
 * "Publish now": after the client approves, the agency confirms once and the
 * approved version goes out on the client's Instagram and Facebook. When it
 * can't be published automatically, the reason is shown instead and the
 * manual "Mark as published" form below it still works.
 */
export function PublishButton({
  itemId,
  targets,
  kindLabel,
  manual,
  blockedReason,
}: {
  itemId: string;
  targets: string[];
  kindLabel: string;
  manual: string[];
  blockedReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, publishing] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await publishNow(prev, fd);
    if (result?.ok) {
      setOpen(false);
      if (result.data?.warning) toast.warning(result.message, { duration: 12_000 });
      else toast.success(result.message ?? "Published");
    }
    return result;
  }, null);

  if (blockedReason) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2.5 text-[13px] text-ink-soft">
        <Info className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
        <span>
          <span className="font-medium text-ink">Can&apos;t publish automatically.</span> {blockedReason}
        </span>
      </p>
    );
  }

  const where = targets.join(" and ");
  return (
    // While it's publishing the dialog stays open, so the result isn't lost.
    <AlertDialog.Root open={open} onOpenChange={(next) => (publishing ? undefined : setOpen(next))}>
      <AlertDialog.Trigger className={buttonClass("primary", "md")}>
        <Send className="size-4" aria-hidden /> Publish now
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <AlertDialog.Content
          aria-busy={publishing}
          className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none"
        >
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Send className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="text-base font-semibold text-ink">Publish on {where} now?</AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted">
                The {kindLabel.toLowerCase()} the client approved goes out publicly straight away, with its approved caption. To take it down later, delete it in the
                app.
              </AlertDialog.Description>
            </div>
          </div>
          {manual.length ? (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              {manual.join(", ")} {manual.length > 1 ? "aren't" : "isn't"} automatic. Post it there by hand.
            </p>
          ) : null}
          <form action={action} className="mt-4">
            <input type="hidden" name="item_id" value={itemId} />
            <FormMessage state={state} />
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <AlertDialog.Cancel disabled={publishing} className={buttonClass("secondary", "md")}>
                Cancel
              </AlertDialog.Cancel>
              <SubmitButton variant="primary" pendingLabel={kindLabel === "Reel" ? "Publishing… reels take a minute or two" : "Publishing…"}>
                <Send className="size-4" aria-hidden /> Publish
              </SubmitButton>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

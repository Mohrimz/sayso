"use client";

import { useActionState, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import { deleteOffer } from "@/app/actions/offers";
import type { ActionState } from "@/app/actions/types";

/** "Remove" on an offer, with a confirmation step. */
export function RemoveOfferButton({ offerId }: { offerId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await deleteOffer(prev, fd);
    if (result?.ok) {
      setOpen(false);
      toast.success(result.message ?? "Removed.");
    }
    return result;
  }, null);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <AlertDialog.Trigger className={buttonClass("ghost", "sm")} aria-label="Remove this offer">
        <Trash2 className="size-4" aria-hidden /> Remove
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <AlertDialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none">
          <AlertDialog.Title className="text-base font-semibold text-ink">Remove this offer?</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-muted">
            The team won&apos;t see it any more. If plans have changed, you can share a new one.
          </AlertDialog.Description>
          <form action={formAction} className="mt-4">
            <input type="hidden" name="offer_id" value={offerId} />
            <FormMessage state={state} />
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel disabled={pending} className={buttonClass("secondary", "md")}>
                Cancel
              </AlertDialog.Cancel>
              <SubmitButton variant="danger" pendingLabel="Removing…">
                Remove
              </SubmitButton>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

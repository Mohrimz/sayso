"use client";

import { useActionState, useState } from "react";
import { AlertDialog } from "radix-ui";
import { Trash2 } from "lucide-react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import { deleteContentItem } from "@/app/actions/content";
import type { ContentStatus } from "@/lib/types";

/** What the client loses, by stage. Published posts can't be deleted. */
function consequence(status: ContentStatus) {
  if (status === "client_review") return "The client is waiting to approve it. It disappears from their list too.";
  if (status === "approved" || status === "scheduled") return "The client already approved it. Their approval goes with it.";
  return "Its files, comments and team notes are deleted with it.";
}

/** "Delete" on a post (agency team, any stage before Published), with a confirmation step. */
export function DeletePostButton({ itemId, title, status }: { itemId: string; title: string; status: ContentStatus }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(deleteContentItem, null);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <AlertDialog.Trigger className={buttonClass("ghost", "sm")} aria-label="Delete this post">
        <Trash2 className="size-4" aria-hidden /> Delete
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <AlertDialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none">
          <AlertDialog.Title className="text-base font-semibold text-ink">Delete “{title}”?</AlertDialog.Title>
          <AlertDialog.Description className="mt-1 text-sm text-muted">
            {consequence(status)} This can&apos;t be undone.
          </AlertDialog.Description>
          <form action={formAction} className="mt-4">
            <input type="hidden" name="item_id" value={itemId} />
            <FormMessage state={state} />
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel disabled={pending} className={buttonClass("secondary", "md")}>
                Cancel
              </AlertDialog.Cancel>
              <SubmitButton variant="danger" pendingLabel="Deleting…">
                Delete post
              </SubmitButton>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

"use client";

import { useActionState, useState } from "react";
import { AlertDialog } from "radix-ui";
import { AlertTriangle } from "lucide-react";
import { deleteAccount } from "@/app/actions/account";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";

/**
 * "Delete my account" with a confirmation step where the person types their
 * email address. Blocked for the agency's only admin.
 */
export function DeleteAccount({ email, blockedReason }: { email: string; blockedReason: string | null }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [state, action] = useActionState(deleteAccount, null);
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  if (blockedReason) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {blockedReason}
      </p>
    );
  }

  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setTyped("");
      }}
    >
      <AlertDialog.Trigger className={buttonClass("danger", "md")}>Delete my account</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <AlertDialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <AlertTriangle className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="text-base font-semibold text-ink">Delete your account?</AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted">
                You&apos;ll be signed out and won&apos;t be able to sign in again. This can&apos;t be undone.
              </AlertDialog.Description>
            </div>
          </div>
          <form action={action} className="mt-4">
            <label className="label" htmlFor="confirm-email">
              Type <span className="font-semibold text-ink">{email}</span> to confirm
            </label>
            <input
              id="confirm-email"
              name="confirm"
              type="email"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              className="field"
            />
            <FormMessage state={state} />
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Cancel className={buttonClass("secondary", "md")}>Cancel</AlertDialog.Cancel>
              <SubmitButton variant="danger" pendingLabel="Deleting…" disabled={!matches}>
                Delete account
              </SubmitButton>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

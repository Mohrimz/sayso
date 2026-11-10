"use client";

import { useActionState, useState } from "react";
import { AlertDialog } from "radix-ui";
import { UserMinus } from "lucide-react";
import { toast } from "sonner";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/** "Remove" with a confirmation step, for taking someone off the team or a client. */
export function RemoveMemberButton({
  action,
  fields,
  name,
  title,
  description,
}: {
  action: Action;
  fields: Record<string, string>;
  name: string;
  title: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) {
      setOpen(false);
      toast.success(result.message ?? "Removed.");
    }
    return result;
  }, null);

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => (pending ? undefined : setOpen(next))}>
      <AlertDialog.Trigger className={buttonClass("ghost", "sm")} aria-label={`Remove ${name}`}>
        Remove
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]" />
        <AlertDialog.Content className="animate-pop fixed top-1/2 left-1/2 z-50 w-[min(420px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-surface p-5 shadow-2xl outline-none">
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger">
              <UserMinus className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <AlertDialog.Title className="text-base font-semibold text-ink">{title}</AlertDialog.Title>
              <AlertDialog.Description className="mt-1 text-sm text-muted">{description}</AlertDialog.Description>
            </div>
          </div>
          <form action={formAction} className="mt-4">
            {Object.entries(fields).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={value} />
            ))}
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

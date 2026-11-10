"use client";

import { useActionState } from "react";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { toast } from "sonner";
import type { ActionState } from "@/app/actions/types";

/** Invite form that also offers the invite link to copy (e.g. to send on WhatsApp). */
export function InviteForm({
  action,
  hidden,
  roles,
  submitLabel = "Send invite",
}: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  hidden: Record<string, string>;
  roles: { value: string; label: string }[];
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok && result.message) toast.success(result.message);
    return result;
  }, null);
  const link = state?.data?.inviteLink ?? state?.devLink;

  return (
    <form action={formAction} className="grid gap-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[1fr_1fr_auto_auto]">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div>
        <label className="label" htmlFor="invite-name">Name</label>
        <input id="invite-name" name="name" className="field" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" type="email" required className="field" autoComplete="off" />
      </div>
      <div>
        <label className="label" htmlFor="invite-role">Role</label>
        <select id="invite-role" name="role" className="field">
          {roles.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
      </div>
      <SubmitButton pendingLabel="Inviting…">{submitLabel}</SubmitButton>
      <div className="sm:col-span-2 xl:col-span-4">
        <FormMessage state={state} />
        {state?.ok && link ? (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-sunken px-3 py-2">
            <span className="text-[13px] text-ink-soft">Invite link (single use, expires in 24 hours):</span>
            <CopyButton value={link} label="Copy link" />
          </div>
        ) : null}
      </div>
    </form>
  );
}

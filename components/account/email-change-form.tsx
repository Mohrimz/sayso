"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";
import { requestEmailChange } from "@/app/actions/account";
import { FormMessage, SubmitButton } from "@/components/action-form";

/** New email address; a confirmation link goes to it before anything changes. */
export function EmailChangeForm({ current }: { current: string }) {
  const [state, action] = useActionState(requestEmailChange, null);
  return (
    <form action={action} className="space-y-3 p-4 sm:p-5">
      <p className="text-sm text-ink-soft">
        You sign in as <span className="font-medium text-ink">{current}</span>. Notifications go here too.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="new-email">New email address</label>
          <input id="new-email" name="email" type="email" autoComplete="email" inputMode="email" required className="field" />
        </div>
        <SubmitButton variant="secondary" pendingLabel="Sending…">Send confirmation link</SubmitButton>
      </div>
      {state?.ok && state.message ? (
        <p role="status" className="flex items-start gap-2 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-800">
          <MailCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {state.message}
        </p>
      ) : null}
      {state?.devLink ? (
        <a href={state.devLink} className="block rounded-lg bg-amber-50 px-3 py-2 text-[13px] break-all text-amber-900 underline">
          Development only (email isn&apos;t set up): open the confirmation link
        </a>
      ) : null}
      <FormMessage state={state} />
    </form>
  );
}

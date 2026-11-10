"use client";

import { ActionForm, SubmitButton } from "@/components/action-form";
import { setupFirstAdmin } from "@/app/actions/auth";

export function SetupForm() {
  return (
    <ActionForm action={setupFirstAdmin} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">Your name</label>
        <input id="name" name="name" required autoComplete="name" className="field" />
      </div>
      <div>
        <label htmlFor="email" className="label">Work email</label>
        <input id="email" name="email" type="email" required autoComplete="email" className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">Password</label>
        <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="field" />
        <p className="hint">At least 8 characters.</p>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Creating…">
        Create admin account
      </SubmitButton>
    </ActionForm>
  );
}

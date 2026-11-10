import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle, Compass, LogOut, TriangleAlert } from "lucide-react";
import { getMyWorkspaces, requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isOnlyAgencyAdmin, soleApproverWorkspaces } from "@/lib/account";
import { Card, CardHeader, PageHeader, buttonClass } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AvatarEditor } from "@/components/account/avatar-editor";
import { EmailChangeForm } from "@/components/account/email-change-form";
import { DeleteAccount } from "@/components/account/delete-account";
import { SignOutForm } from "@/components/arrival/arrival";
import { signOutEverywhere, updateNotificationPrefs, updatePassword, updateProfile, withdrawCookieConsent } from "@/app/actions/account";
import { cookies } from "next/headers";
import { CONSENT_COOKIE, consentAcceptedAt } from "@/lib/consent";

export const metadata: Metadata = { title: "Account" };

const EMAIL_RESULTS: Record<string, { ok: boolean; text: string }> = {
  changed: { ok: true, text: "Your email address has been changed. Use it next time you sign in." },
  expired: { ok: false, text: "That confirmation link has expired or was already used. Request a new one below." },
  taken: { ok: false, text: "That email address is now used by another account, so it wasn't changed." },
  failed: { ok: false, text: "We couldn't change your email address. Please try again." },
};

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const emailResult = typeof params.email === "string" ? EMAIL_RESULTS[params.email] : undefined;
  const consentAt = consentAcceptedAt((await cookies()).get(CONSENT_COOKIE)?.value);

  const [onlyAdmin, soleApprover, nameRow, workspaces] = await Promise.all([
    isOnlyAgencyAdmin(viewer),
    viewer.side === "client" ? soleApproverWorkspaces(viewer.id) : Promise.resolve([]),
    viewer.side === "client"
      ? (await createClient()).from("profiles").select("full_name").eq("id", viewer.id).maybeSingle()
      : Promise.resolve({ data: null }),
    viewer.side === "client" ? getMyWorkspaces() : Promise.resolve([]),
  ]);
  // Clients can replay the walkthrough on their (first) client workspace.
  const tourHome = workspaces[0] ? `/w/${workspaces[0].slug}` : null;

  // Clients are asked (by notification) to complete their profile; this shows what's left.
  const profileSteps =
    viewer.side === "client"
      ? [
          { label: "Your name", done: Boolean(nameRow.data?.full_name?.trim()) },
          { label: "Job title", done: Boolean(viewer.jobTitle) },
          { label: "Phone number", done: Boolean(viewer.phone) },
          { label: "Profile photo", done: Boolean(viewer.avatarPath) },
        ]
      : [];
  const stepsDone = profileSteps.filter((p) => p.done).length;

  const allPrefs = [
    { key: "email_approvals", label: "Approvals", hint: viewer.side === "client" ? "When posts are ready for your approval" : viewer.agencyRole === "admin" ? "When a post is sent for your review or a client approves one" : "When a client approves content" },
    { key: "email_changes", label: "Change requests", hint: "When a client asks for changes" },
    { key: "email_comments", label: "Comments", hint: "New comments on posts you can see" },
    { key: "email_tasks", label: "Tasks", hint: "When something is assigned to you" },
    { key: "email_messages", label: "Chat messages", hint: "When someone messages you. At most one email per chat until you've read it" },
    { key: "email_offers", label: "New client offers", hint: "When a client shares an offer", agencyOnly: true },
  ] as const;
  const prefs = allPrefs.filter((p) => !("agencyOnly" in p) || viewer.side === "agency");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Account" description="Your profile, how you sign in, and which emails you get." />

      {emailResult ? (
        <p
          role={emailResult.ok ? "status" : "alert"}
          className={
            emailResult.ok
              ? "flex items-start gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800"
              : "flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
          }
        >
          {emailResult.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />}
          {emailResult.text}
        </p>
      ) : null}

      {profileSteps.length && stepsDone < profileSteps.length ? (
        <section aria-label="Finish your profile" className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold text-ink">Finish your profile</h2>
            <span className="text-[13px] text-amber-800 tabular-nums">
              {stepsDone} of {profileSteps.length} done
            </span>
          </div>
          <p className="mt-1 text-[13px] text-ink-soft">It helps the team know who they&apos;re working with. Fill in the details below.</p>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-amber-100" aria-hidden>
            <div className="h-full rounded-full bg-amber-500 transition-[width] duration-500" style={{ width: `${(stepsDone / profileSteps.length) * 100}%` }} />
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {profileSteps.map((step) => (
              <li key={step.label} className={step.done ? "flex items-center gap-2 text-[13px] text-emerald-800" : "flex items-center gap-2 text-[13px] text-ink"}>
                {step.done ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" aria-hidden /> : <Circle className="size-4 shrink-0 text-amber-500" aria-hidden />}
                <span className={step.done ? "line-through decoration-emerald-300" : undefined}>{step.label}</span>
                <span className="sr-only">{step.done ? "(done)" : "(missing)"}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Card>
        <CardHeader title="Profile" description="Shown to the people you work with in the portal." />
        <div className="flex flex-col gap-6 p-4 sm:flex-row sm:items-start sm:p-5">
          <AvatarEditor userId={viewer.id} name={viewer.name} url={viewer.avatarUrl} />
          <ActionForm action={updateProfile} className="grid flex-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="name">Full name</label>
              <input id="name" name="name" defaultValue={viewer.name} required maxLength={80} autoComplete="name" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="job_title">Job title</label>
              <input
                id="job_title"
                name="job_title"
                defaultValue={viewer.jobTitle ?? ""}
                maxLength={80}
                autoComplete="organization-title"
                placeholder={viewer.side === "agency" ? "e.g. Content lead" : "e.g. Marketing manager"}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="phone">Phone</label>
              <input id="phone" name="phone" type="tel" defaultValue={viewer.phone ?? ""} maxLength={40} autoComplete="tel" placeholder="Optional" className="field" />
            </div>
            <p className="text-xs text-muted sm:col-span-2">
              {viewer.side === "client"
                ? "Your colleagues and the agency team can see your job title and phone number."
                : "Your agency colleagues and clients in the portal can see your job title and phone number."}
            </p>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save profile</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Card>

      <Card>
        <CardHeader title="Email address" description="Changing it needs a click on a link we send to the new address." />
        <EmailChangeForm current={viewer.email} />
      </Card>

      {tourHome ? (
        <Card>
          <CardHeader title="Walkthrough" description="A quick look at each page of the portal and what it's for." />
          <div className="p-4 sm:p-5">
            <Link href={`${tourHome}?tour=1`} className={buttonClass("secondary", "md")}>
              <Compass className="size-4" aria-hidden /> Take the tour
            </Link>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Emails" description="Notifications always appear under the bell. Choose which ones are also emailed." />
        <ActionForm action={updateNotificationPrefs} className="space-y-1 p-2 sm:p-3">
          {prefs.map((p) => (
            <label key={p.key} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-sunken">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{p.label}</span>
                <span className="block text-xs text-muted">{p.hint}</span>
              </span>
              <input type="checkbox" name={p.key} defaultChecked={viewer.prefs[p.key]} className="peer sr-only" />
              <span
                aria-hidden
                className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4"
              />
            </label>
          ))}
          <div className="px-2 pt-2">
            <SubmitButton size="sm" pendingLabel="Saving…">Save</SubmitButton>
          </div>
        </ActionForm>
      </Card>

      <Card>
        <CardHeader title="Password and sign-in" description="A password is optional. You can always sign in with an email link instead." />
        <ActionForm action={updatePassword} resetOnSuccess className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:p-5">
          <div className="flex-1">
            <label className="label" htmlFor="password">New password</label>
            <input id="password" name="password" type="password" minLength={8} autoComplete="new-password" required className="field" />
          </div>
          <SubmitButton pendingLabel="Saving…">Set password</SubmitButton>
        </ActionForm>
        <SignOutForm
          name={viewer.name}
          action={signOutEverywhere}
          className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
        >
          <div>
            <p className="text-sm font-medium text-ink">Sign out everywhere</p>
            <p className="text-xs text-muted">
              For a lost phone or a shared computer. You&apos;re signed out here straight away, and on other devices within the hour.
            </p>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Signing out…">
            <LogOut className="size-4" aria-hidden /> Sign out everywhere
          </SubmitButton>
        </SignOutForm>
        <form action={withdrawCookieConsent} className="flex flex-col gap-3 border-t border-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-sm font-medium text-ink">Cookies</p>
            <p className="text-xs text-muted">
              {consentAt
                ? `You accepted essential cookies on ${consentAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.`
                : "You haven't accepted cookies on this browser yet."}{" "}
              Withdrawing signs you out on this browser.{" "}
              <Link href="/privacy#cookies" className="font-medium text-accent-ink underline-offset-2 hover:underline">
                What we store
              </Link>
            </p>
          </div>
          <SubmitButton variant="secondary" pendingLabel="Withdrawing…">
            Withdraw cookie consent
          </SubmitButton>
        </form>
      </Card>

      <Card className="border-danger/25">
        <CardHeader title="Delete account" />
        <div className="space-y-3 p-4 sm:p-5">
          <p className="text-sm text-ink-soft">
            Permanently removes your profile, picture and access to every workspace. Comments, approvals and chat messages you&apos;ve
            written stay, so everyone keeps the record of what was agreed, but they&apos;ll show as &ldquo;Former member&rdquo;. Our{" "}
            <Link href="/privacy" className="font-medium text-accent-ink underline underline-offset-2 hover:text-accent">
              Privacy Policy
            </Link>{" "}
            explains what we keep and why.
          </p>
          {soleApprover.length ? (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                You&apos;re the only approver for {soleApprover.join(", ")}. Before you go, invite a colleague as an approver from Team &amp; package so posts can still be approved.
              </span>
            </p>
          ) : null}
          <DeleteAccount
            email={viewer.email}
            blockedReason={onlyAdmin ? "You're the agency's only admin, so this account can't be deleted. Make someone else an admin on the Team page first." : null}
          />
        </div>
      </Card>
    </div>
  );
}

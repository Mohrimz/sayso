"use client";

import { useActionState, useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Logo } from "@/components/logo";
import { Card, buttonClass } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { AvatarEditor } from "@/components/account/avatar-editor";
import { finishOnboarding, saveOnboardingProfile, saveSignInDetails } from "@/app/actions/onboarding";
import type { ActionState } from "@/app/actions/types";
import { APP_NAME } from "@/lib/env";
import { cn } from "@/lib/utils";

type Step = "about" | "photo" | "signin" | "done";

export type OnboardingProps = {
  userId: string;
  email: string;
  /** A login the agency made before knowing their email: they switch to their own here. */
  placeholderEmail: boolean;
  name: string;
  jobTitle: string;
  phone: string;
  avatarUrl: string | null;
  workspaceName: string | null;
};

/**
 * A client's first sign-in: who they are, a photo, their own email and
 * password (placeholder logins only), then an offer of a walkthrough. It
 * covers the whole app until it's finished, and picks up at the first step
 * that still needs doing.
 */
export function Onboarding(props: OnboardingProps) {
  const steps: Step[] = props.placeholderEmail ? ["about", "photo", "signin", "done"] : ["about", "photo", "done"];
  const [step, setStep] = useState<Step>(() =>
    !props.name || !props.jobTitle || !props.phone ? "about" : !props.avatarUrl ? "photo" : props.placeholderEmail ? "signin" : "done",
  );
  const index = steps.indexOf(step);
  // No way back once the email link has gone out, or from the last step.
  const [linkSent, setLinkSent] = useState(false);
  const back = index > 0 && step !== "done" && !(step === "signin" && linkSent) ? () => setStep(steps[index - 1]) : undefined;

  // The app underneath shouldn't scroll while this is open.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  return (
    // Just under the sign-in welcome animation (z-70), which plays first and then fades away.
    <div role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="fixed inset-0 z-[65] overflow-y-auto bg-canvas">
      <div className="mx-auto flex min-h-full w-full max-w-[30rem] flex-col px-4 pt-6 pb-12 sm:pt-10">
        <div className="flex items-center justify-between">
          <Logo />
          <span className="text-[13px] text-muted tabular-nums">
            Step {index + 1} of {steps.length}
          </span>
        </div>
        <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={cn("h-1 rounded-full transition-colors duration-500", i <= index ? "bg-accent" : "bg-line")} />
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-10 sm:mt-14"
          >
            {back ? (
              <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
                <ArrowLeft className="size-4" aria-hidden /> Back
              </button>
            ) : null}
            {step === "about" ? <AboutStep {...props} onDone={() => setStep("photo")} /> : null}
            {step === "photo" ? <PhotoStep {...props} onDone={() => setStep(props.placeholderEmail ? "signin" : "done")} /> : null}
            {step === "signin" ? <SignInStep {...props} onSent={() => setLinkSent(true)} onDone={() => setStep("done")} /> : null}
            {step === "done" ? <DoneStep {...props} /> : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h1 id="onboarding-title" className="text-[1.75rem] leading-tight font-bold tracking-tight text-ink sm:text-[2rem]">
        {title}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{children}</p>
    </>
  );
}

function AboutStep({ name, jobTitle, phone, workspaceName, onDone }: OnboardingProps & { onDone: () => void }) {
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await saveOnboardingProfile(prev, fd);
    if (result?.ok) onDone();
    return result;
  }, null);
  return (
    <>
      <Heading title={`Welcome to ${APP_NAME}`}>
        {workspaceName ? `Let's set up your account for ${workspaceName}.` : "Let's set up your account."} It takes about two minutes.
      </Heading>
      <Card className="mt-7 p-5 sm:p-6">
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="ob-name">Your name</label>
            <input id="ob-name" name="name" defaultValue={name} required maxLength={80} autoComplete="name" className="field" autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="ob-job">Job title</label>
            <input id="ob-job" name="job_title" defaultValue={jobTitle} required maxLength={80} autoComplete="organization-title" className="field" placeholder="e.g. Founder, Marketing manager" />
          </div>
          <div>
            <label className="label" htmlFor="ob-phone">Phone number</label>
            <input id="ob-phone" name="phone" type="tel" defaultValue={phone} required maxLength={40} autoComplete="tel" inputMode="tel" className="field" placeholder="+94 77 123 4567" />
            <p className="hint">Only the agency team sees it, for when something needs a quick call.</p>
          </div>
          <FormMessage state={state} />
          <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
            Continue
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}

function PhotoStep({ userId, name, avatarUrl, onDone }: OnboardingProps & { onDone: () => void }) {
  return (
    <>
      <Heading title="Add a profile photo">
        The team sees it next to your messages, comments and approvals. A clear photo of your face works best.
      </Heading>
      <Card className="mt-7 p-5 sm:p-6">
        <div className="flex justify-center py-2">
          <AvatarEditor userId={userId} name={name || "You"} url={avatarUrl} />
        </div>
        <button type="button" onClick={onDone} disabled={!avatarUrl} className={cn(buttonClass("primary", "lg"), "mt-5 w-full")}>
          {avatarUrl ? "Continue" : "Add a photo to continue"}
        </button>
      </Card>
    </>
  );
}

function SignInStep({ email, onSent, onDone }: OnboardingProps & { onSent: () => void; onDone: () => void }) {
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await saveSignInDetails(prev, fd);
    if (result?.ok) onSent();
    return result;
  }, null);
  if (state?.ok) {
    return (
      <>
        <Heading title="Check your inbox">One last click and your email is switched.</Heading>
        <Card className="mt-7 space-y-4 p-5 sm:p-6">
          <p className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
            <MailCheck className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
            <span>
              {state.message} Until then, sign in with <span className="font-medium text-ink">{email}</span> and your new password.
            </span>
          </p>
          {state.devLink ? (
            <a href={state.devLink} target="_blank" rel="noreferrer" className="block rounded-lg bg-amber-50 px-3 py-2 text-[13px] break-all text-amber-900 underline">
              Development only (email isn&apos;t set up): open the confirmation link
            </a>
          ) : null}
          <button type="button" onClick={onDone} className={cn(buttonClass("primary", "lg"), "w-full")}>
            Continue
          </button>
        </Card>
      </>
    );
  }
  return (
    <>
      <Heading title="Your email and password">
        You signed in with a login we made for you. Switch to your own email address and a password only you know.
      </Heading>
      <Card className="mt-7 p-5 sm:p-6">
        <form action={action} className="space-y-4">
          <div>
            <label className="label" htmlFor="ob-email">Your email address</label>
            <input id="ob-email" name="email" type="email" required autoComplete="email" inputMode="email" className="field" autoFocus />
            <p className="hint">Approval requests and updates are sent here. We&apos;ll email it a link to confirm.</p>
          </div>
          <div>
            <label className="label" htmlFor="ob-password">New password</label>
            <input id="ob-password" name="password" type="password" required minLength={8} autoComplete="new-password" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="ob-password2">Type it again</label>
            <input id="ob-password2" name="password_confirm" type="password" required minLength={8} autoComplete="new-password" className="field" />
            <p className="hint">At least 8 characters. It replaces the one you were given.</p>
          </div>
          <FormMessage state={state} />
          <SubmitButton className="w-full" size="lg" pendingLabel="Saving…">
            Save and send the link
          </SubmitButton>
        </form>
      </Card>
    </>
  );
}

function DoneStep({ name }: OnboardingProps) {
  const first = name.split(" ")[0];
  return (
    <>
      <Heading title={first ? `You're all set, ${first}` : "You're all set"}>
        Want a quick look around? The tour opens each page in turn and says what it&apos;s for. It takes about two minutes.
      </Heading>
      <div className="mt-7 flex flex-col gap-2.5">
        <form action={finishOnboarding.bind(null, true)}>
          <SubmitButton className="w-full" size="lg" pendingLabel="Opening…">
            Start the tour
          </SubmitButton>
        </form>
        <form action={finishOnboarding.bind(null, false)}>
          <SubmitButton variant="ghost" className="w-full" size="lg" pendingLabel="Opening…">
            Skip the tour
          </SubmitButton>
        </form>
      </div>
    </>
  );
}

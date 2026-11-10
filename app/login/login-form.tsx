"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Eye, EyeOff, KeyRound, Mail, MailCheck } from "lucide-react";
import { sendMagicLink, signInWithPassword } from "@/app/actions/auth";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { cn } from "@/lib/utils";

type Mode = "link" | "password";

const MODES: { id: Mode; label: string; icon: typeof Mail; hint: string }[] = [
  { id: "link", label: "Email link", icon: Mail, hint: "We'll email you a secure one-time link. No password to remember." },
  { id: "password", label: "Password", icon: KeyRound, hint: "Use the password you set for your account." },
];

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<Mode>("link");
  const [attempt, setAttempt] = useState(0);
  // Kept here so the address survives a refused attempt (forms reset to their default values) and a switch of tab.
  const [email, setEmail] = useState("");
  const active = MODES.find((m) => m.id === mode)!;

  return (
    <div>
      <div className="relative grid grid-cols-2 rounded-xl bg-sunken p-1" role="tablist" aria-label="How to sign in">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={mode === m.id}
            onClick={() => setMode(m.id)}
            className={cn("relative z-10 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors", mode === m.id ? "text-ink" : "text-muted hover:text-ink")}
          >
            {mode === m.id ? (
              <motion.span layoutId="login-mode" className="absolute inset-0 -z-10 rounded-lg bg-surface shadow-sm" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
            ) : null}
            <m.icon className="size-4" aria-hidden />
            {m.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-snug text-muted">{active.hint}</p>

      <div className="mt-5">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, x: mode === "link" ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: mode === "link" ? 12 : -12 }}
            transition={{ duration: 0.18 }}
          >
            {mode === "link" ? (
              <LinkForm key={attempt} next={next} email={email} onEmail={setEmail} onRetry={() => setAttempt((a) => a + 1)} />
            ) : (
              <PasswordForm next={next} email={email} onEmail={setEmail} onUseLink={() => setMode("link")} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function IconInput({ icon: Icon, ...props }: React.ComponentProps<"input"> & { icon: typeof Mail }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
      <input {...props} className={cn("field h-11 pl-9", props.className)} />
    </div>
  );
}

type EmailProps = { email: string; onEmail: (value: string) => void };

function LinkForm({ next, onRetry, email, onEmail }: { next: string; onRetry: () => void } & EmailProps) {
  const [state, action] = useActionState(sendMagicLink, null);

  if (state?.ok) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="rounded-2xl border border-line bg-accent-soft/50 p-5 text-center" role="status">
        <motion.span
          className="relative mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-accent text-white"
          initial={{ scale: 0.5, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 16 }}
        >
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full bg-accent/40"
            initial={{ scale: 1, opacity: 0.6 }}
            animate={{ scale: 1.7, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
          />
          <MailCheck className="relative size-6" aria-hidden />
        </motion.span>
        <p className="text-base font-semibold text-ink">Check your inbox</p>
        <p className="mt-1 text-sm text-ink-soft">{state.message}</p>
        {state.devLink ? (
          <a href={state.devLink} className="mt-3 block rounded-lg bg-amber-50 px-3 py-2 text-[13px] break-all text-amber-900 underline">
            Development only: open the sign-in link
          </a>
        ) : null}
        <button type="button" onClick={onRetry} className="mt-4 text-[13px] font-medium text-accent hover:underline">
          Use a different email
        </button>
      </motion.div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="link-email" className="label">
          Email address
        </label>
        <IconInput
          icon={Mail}
          id="link-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="send"
          required
          placeholder="you@company.com"
          defaultValue={email}
          onChange={(e) => onEmail(e.target.value)}
        />
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Sending link…">
        Send sign-in link
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

function PasswordForm({ next, onUseLink, email, onEmail }: { next: string; onUseLink: () => void } & EmailProps) {
  const [state, action] = useActionState(signInWithPassword, null);
  const [visible, setVisible] = useState(false);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="pw-email" className="label">
          Email address
        </label>
        <IconInput
          icon={Mail}
          id="pw-email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          enterKeyHint="next"
          required
          placeholder="you@company.com"
          defaultValue={email}
          onChange={(e) => onEmail(e.target.value)}
          onKeyDown={(e) => {
            // The keyboard's "Next" key moves on to the password instead of submitting.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              document.getElementById("pw-password")?.focus();
            }
          }}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label htmlFor="pw-password" className="label">
            Password
          </label>
          <button type="button" onClick={onUseLink} className="text-xs font-medium text-accent hover:underline">
            Forgot it? Get an email link
          </button>
        </div>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            id="pw-password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            enterKeyHint="go"
            required
            className="field h-11 pr-11 pl-9"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink"
            aria-label={visible ? "Hide password" : "Show password"}
            aria-pressed={visible}
          >
            {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
      </div>
      <SubmitButton className="w-full" size="lg" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}

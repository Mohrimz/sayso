"use client";

import { useActionState, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { buttonClass } from "@/components/ui";
import { useSheet } from "@/components/sheet";
import { cn } from "@/lib/utils";
import type { ActionState } from "@/app/actions/types";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * A form bound to a server action. Success shows a toast (and closes the
 * surrounding sheet, if any); errors show inline next to the form.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = false,
  showSuccess = true,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  showSuccess?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const sheet = useSheet();
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await action(prev, fd);
    if (result?.ok) {
      if (showSuccess && result.message) toast.success(result.message);
      if (resetOnSuccess) ref.current?.reset();
      sheet?.close();
    }
    return result;
  }, null);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      <FormMessage state={state} />
    </form>
  );
}

/** Inline error message (successes are shown as toasts). */
export function FormMessage({ state }: { state: ActionState; showSuccess?: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {state?.error ? (
        <motion.p
          key={state.error}
          role="alert"
          initial={{ opacity: 0, height: 0, marginTop: 0 }}
          animate={{ opacity: 1, height: "auto", marginTop: 8 }}
          exit={{ opacity: 0, height: 0, marginTop: 0 }}
          className="overflow-hidden rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"
        >
          {state.error}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
  disabled,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
  className?: string;
  name?: string;
  value?: string;
  disabled?: boolean;
}) {
  const { pending, data } = useFormStatus();
  // With several submit buttons, only the one that was pressed shows "pending".
  const mine = pending && (!name || data?.get(name) === value);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      aria-busy={mine}
      className={cn(buttonClass(variant, size), className)}
    >
      {mine ? <Spinner /> : null}
      {mine && pendingLabel ? pendingLabel : children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn("inline-block size-4 rounded-full border-2 border-current border-r-transparent", className)}
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.7, ease: "linear" }}
    />
  );
}

"use client";

import { useActionState, useState } from "react";
import { preload } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { submitApproval } from "@/app/actions/content";
import { FormMessage, SubmitButton } from "@/components/action-form";
import { stampApproved } from "@/components/approved-seal";
import { buttonClass } from "@/components/ui";
import type { ActionState } from "@/app/actions/types";

/** Approve / Request changes for client approvers. Request changes needs a comment. */
export function ApprovalPanel({
  itemId,
  deadlineLabel,
  title,
  cover,
}: {
  itemId: string;
  deadlineLabel?: string;
  /** The post, for the approval seal moment: its title, and its first photo if it has one. */
  title: string;
  cover?: string | null;
}) {
  const [mode, setMode] = useState<"choose" | "changes">("choose");
  // The seal is ready before it is needed.
  preload("/empty/seal-top.webp", { as: "image" });
  const [state, action] = useActionState(async (prev: ActionState, fd: FormData) => {
    const result = await submitApproval(prev, fd);
    if (result?.ok) {
      if (fd.get("decision") === "approved") {
        stampApproved({ cover, title });
        toast.success(result.message ?? "Approved");
      } else {
        toast.success(result.message ?? "Changes requested");
      }
    }
    return result;
  }, null);

  return (
    <form
      action={action}
      className="glow-ring animate-rise rounded-2xl border border-transparent bg-gradient-to-b from-accent-soft to-surface p-4 shadow-lg shadow-accent/10 sm:p-5"
    >
      <input type="hidden" name="item_id" value={itemId} />
      <h2 className="text-base font-semibold text-ink">Ready for your approval</h2>
      {deadlineLabel ? <p className="mt-0.5 text-[13px] text-ink-soft">Please respond by {deadlineLabel}.</p> : null}

      <AnimatePresence mode="wait" initial={false}>
        {mode === "choose" ? (
          <motion.div
            key="choose"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <SubmitButton variant="success" size="lg" name="decision" value="approved" pendingLabel="Approving…">
                <CheckCircle2 className="size-5" aria-hidden /> Approve
              </SubmitButton>
              <button type="button" className={buttonClass("secondary", "lg")} onClick={() => setMode("changes")}>
                <MessageSquareWarning className="size-5" aria-hidden /> Request changes
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="changes"
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18 }}
          >
            <label className="mt-4 block">
              <span className="label">What should we change?</span>
              <textarea
                name="comment"
                rows={4}
                required
                autoFocus
                className="field"
                placeholder="e.g. Please use the photo with the whole team, and mention we're open on Sundays."
              />
            </label>
            <input type="hidden" name="decision" value="changes_requested" />
            <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className={buttonClass("ghost", "lg")} onClick={() => setMode("choose")}>
                Back
              </button>
              <SubmitButton variant="primary" size="lg" pendingLabel="Sending…">
                Send to the team
              </SubmitButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <FormMessage state={state} />
    </form>
  );
}

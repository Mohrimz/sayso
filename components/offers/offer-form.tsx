import { Send } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { shareOffer } from "@/app/actions/offers";
import { OFFER_MAX_LENGTH } from "@/lib/offers";

/** The client's one-box "share an offer" form: just the message, like an announcement. */
export function OfferComposer({ workspaceId }: { workspaceId: string }) {
  return (
    <ActionForm action={shareOffer} resetOnSuccess className="rounded-2xl border border-line bg-surface p-4 shadow-[0_1px_0_rgba(0,0,0,0.03)] sm:p-5">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <label htmlFor="offer-message" className="block text-[15px] font-semibold text-ink">
        Share an offer with the team
      </label>
      <p className="mt-0.5 text-[13px] text-muted">A sale, a discount, a launch: write it the way you&apos;d tell us. We&apos;ll plan posts around it.</p>
      <textarea
        id="offer-message"
        name="message"
        required
        rows={4}
        maxLength={OFFER_MAX_LENGTH}
        placeholder="e.g. 20% off all earrings this weekend (Friday to Sunday), code WEEKEND20, online only."
        className="field mt-3 resize-y"
      />
      <div className="mt-3 flex justify-end">
        <SubmitButton pendingLabel="Sharing…">
          <Send className="size-4" aria-hidden /> Share with the team
        </SubmitButton>
      </div>
    </ActionForm>
  );
}

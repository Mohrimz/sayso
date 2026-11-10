import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createWorkspace } from "@/app/actions/workspaces";

export const metadata: Metadata = { title: "New client" };

const TIME_ZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["UTC"];

export default async function NewClientPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New client" description="Creates a private workspace. You can add the brand kit and invite the client next." />
      <Card className="p-4 sm:p-6">
        <ActionForm action={createWorkspace} className="space-y-6">
          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-semibold text-ink sm:col-span-2">Client</h2>
            <div>
              <label className="label" htmlFor="name">Business name</label>
              <input id="name" name="name" required className="field" />
            </div>
            <div>
              <label className="label" htmlFor="slug">Web address</label>
              <div className="flex items-center rounded-lg border border-line-strong bg-sunken pl-3 text-sm text-muted focus-within:border-accent">
                /w/
                <input id="slug" name="slug" className="w-full rounded-r-lg border-0 bg-surface px-2 py-2 text-ink outline-none" placeholder="from the name" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="website">Website</label>
              <input id="website" name="website" type="url" className="field" placeholder="https://" />
            </div>
            <div>
              <label className="label" htmlFor="time_zone">Time zone</label>
              <input id="time_zone" name="time_zone" list="tz-list" defaultValue="Europe/London" className="field" />
              <datalist id="tz-list">
                {TIME_ZONES.map((tz) => <option key={tz} value={tz} />)}
              </datalist>
            </div>
            <div>
              <label className="label" htmlFor="main_contact_name">Main contact</label>
              <input id="main_contact_name" name="main_contact_name" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="main_contact_email">Main contact email</label>
              <input id="main_contact_email" name="main_contact_email" type="email" className="field" />
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <h2 className="text-sm font-semibold text-ink sm:col-span-2">Package</h2>
            <div>
              <label className="label" htmlFor="service_name">Service name</label>
              <input id="service_name" name="service_name" className="field" placeholder="e.g. Social Growth" />
            </div>
            <div className="grid grid-cols-[1fr_90px] gap-3">
              <div>
                <label className="label" htmlFor="monthly_fee">Monthly fee</label>
                <input id="monthly_fee" name="monthly_fee" type="number" min={0} step="0.01" className="field" />
              </div>
              <div>
                <label className="label" htmlFor="currency">Currency</label>
                <input id="currency" name="currency" defaultValue="USD" maxLength={3} className="field uppercase" />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="start_date">Start date</label>
              <input id="start_date" name="start_date" type="date" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="term_months">Contract length (months)</label>
              <input id="term_months" name="term_months" type="number" min={1} className="field" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ["quota_feed_post", "Feed posts", 12],
                ["quota_reel", "Reels", 4],
                ["quota_story", "Stories", 8],
                ["quota_report", "Reports", 1],
                ["revision_rounds", "Revision rounds", 2],
              ].map(([name, label, value]) => (
                <div key={name as string}>
                  <label className="label" htmlFor={name as string}>{label}</label>
                  <input id={name as string} name={name as string} type="number" min={0} defaultValue={value as number} className="field" />
                </div>
              ))}
            </div>
            <fieldset className="sm:col-span-2">
              <legend className="label">Approvals</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex cursor-pointer gap-3 rounded-lg border border-line-strong p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="approval_rule" value="any" defaultChecked className="mt-1" />
                  <span className="text-sm">
                    <span className="block font-medium">One approval is enough</span>
                    <span className="block text-xs text-muted">Recommended for most clients</span>
                  </span>
                </label>
                <label className="flex cursor-pointer gap-3 rounded-lg border border-line-strong p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="approval_rule" value="all" className="mt-1" />
                  <span className="text-sm">
                    <span className="block font-medium">Every approver must approve</span>
                    <span className="block text-xs text-muted">For clients with several decision makers</span>
                  </span>
                </label>
              </div>
            </fieldset>
          </section>

          <SubmitButton size="lg" pendingLabel="Creating…">Create workspace</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}

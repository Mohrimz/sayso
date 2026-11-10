import { ChartNoAxesColumnIncreasing } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { linkSocialAccounts } from "@/app/actions/post-results";
import { facebookPages, instagramAccounts, resultsConfigured } from "@/lib/post-results";

/**
 * Client settings: which Instagram account and Facebook Page this client's
 * post results come from. The lists are the accounts the agency's Make.com
 * connection can read (INSTAGRAM_ACCOUNTS, FACEBOOK_PAGES); admins choose,
 * everyone else sees the current links.
 */
export function InstagramResultsCard({
  workspaceId,
  instagram,
  facebook,
  canEdit,
}: {
  workspaceId: string;
  instagram: string | null;
  facebook: string | null;
  canEdit: boolean;
}) {
  const igAccounts = instagramAccounts();
  const fbPages = facebookPages();
  const label = (list: { id: string; label: string }[], id: string | null) => (id ? (list.find((a) => a.id === id)?.label ?? id) : null);

  return (
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ChartNoAxesColumnIncreasing className="size-4 text-accent" aria-hidden /> Post results
          </span>
        }
        description="Shows how this client's published posts are doing. Instagram: views, reach and engagement. Facebook: reactions, comments and shares."
      />
      <div className="space-y-3 p-4 sm:p-5">
        {!resultsConfigured() ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
            Results aren&apos;t switched on for this site yet: the Make API token (MAKE_API_TOKEN) hasn&apos;t been added.
          </p>
        ) : null}
        {canEdit ? (
          <ActionForm action={linkSocialAccounts} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <div>
              <label className="label" htmlFor="instagram_account_id">Instagram account</label>
              <select id="instagram_account_id" name="instagram_account_id" defaultValue={instagram ?? ""} className="field">
                <option value="">Not linked</option>
                {igAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
                {instagram && !igAccounts.some((a) => a.id === instagram) ? <option value={instagram}>{instagram} (no longer listed)</option> : null}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="facebook_page_id">Facebook Page</label>
              <select id="facebook_page_id" name="facebook_page_id" defaultValue={facebook ?? ""} className="field">
                <option value="">Not linked</option>
                {fbPages.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
                {facebook && !fbPages.some((p) => p.id === facebook) ? <option value={facebook}>{facebook} (no longer listed)</option> : null}
              </select>
            </div>
            <p className="hint sm:col-span-2">
              {igAccounts.length || fbPages.length
                ? "These are the accounts your Make connection can read. Instagram results need the post's live Instagram link; the Facebook post is found automatically from the time it went out."
                : "No accounts are listed yet. Add them to INSTAGRAM_ACCOUNTS and FACEBOOK_PAGES on the server."}
            </p>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Instagram</dt>
              <dd className="text-ink">{label(igAccounts, instagram) ?? "Not linked"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Facebook Page</dt>
              <dd className="text-ink">{label(fbPages, facebook) ?? "Not linked"}</dd>
            </div>
          </dl>
        )}
      </div>
    </Card>
  );
}

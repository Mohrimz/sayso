import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ChevronLeft, CircleAlert, Clock, ExternalLink, Hourglass, Link2, Send } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAgencyAssignees, getPeople, getWorkspaceMembers } from "@/lib/queries";
import { mediaDownloads, parseMedia, signMedia } from "@/lib/media";
import { PostDownloads } from "@/components/post-downloads";
import { CONTENT_TYPES, captionFor, platformLabel } from "@/lib/content";
import { defaultApprovalDeadline, formatDateTime, isoToZonedInput, zoneLabel } from "@/lib/dates";
import { asArray, asObject, type ApprovalRuleEntry, type ContentItem } from "@/lib/types";
import { Badge, Card } from "@/components/ui";
import { PostResultsCard } from "@/components/post-results-card";
import { initialResultsView } from "@/lib/post-results";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AnimatedBar, FadeIn } from "@/components/anim";
import { ApprovalPanel } from "@/components/approval-panel";
import { CommentThread, InternalNotes } from "@/components/comment-thread";
import { ContentForm } from "@/components/content-form";
import { CopyButton } from "@/components/copy-button";
import { DeadlineText } from "@/components/content-card";
import { MediaUploader } from "@/components/media-uploader";
import { PostPreview } from "@/components/post-preview";
import { RealtimeRefresh } from "@/components/realtime-refresh";
import { Sheet } from "@/components/sheet";
import { StatusBadge } from "@/components/status-badge";
import { Tabs, TabsContent } from "@/components/tabs";
import { TypeIcon } from "@/components/type-icon";
import { internalReview, moveContent, saveLiveUrl, sendApprovedWork, updateContentItem } from "@/app/actions/content";
import { getApprovedWork } from "@/lib/approved-work";
import { DeletePostButton } from "@/components/delete-post-button";
import { PublishButton } from "@/components/publish-button";
import { requestPublish } from "@/app/actions/publish";
import { publishPlan } from "@/lib/publish";
import { cn } from "@/lib/utils";

// "Publish now" waits for Instagram and Facebook to finish processing (reels take a few minutes).
export const maxDuration = 300;

export default async function ContentPage({ params, searchParams }: PageProps<"/w/[slug]/content/[id]">) {
  const [{ slug, id }, sp] = await Promise.all([params, searchParams]);
  const { workspace, viewer, can } = await getWorkspaceAccess(slug);
  const supabase = await createClient();
  const { data: item } = await supabase.from("content_items").select("*").eq("id", id).eq("workspace_id", workspace.id).maybeSingle();
  if (!item) notFound();

  const tz = workspace.time_zone;
  const base = `/w/${workspace.slug}`;
  const side = can.isAgency ? "agency" : "client";

  const [versionsRes, commentsRes, approvalsRes, notesRes, planRes, members, assignees] = await Promise.all([
    supabase.from("content_versions").select("*").eq("content_item_id", item.id).order("version_number", { ascending: false }),
    supabase.from("comments").select("*").eq("content_item_id", item.id).order("created_at"),
    supabase.from("approvals").select("*").eq("content_item_id", item.id).order("created_at", { ascending: false }),
    can.seeInternal
      ? supabase.from("internal_notes").select("*").eq("content_item_id", item.id).order("created_at")
      : Promise.resolve({ data: [] as never[] }),
    supabase.from("monthly_plans").select("month, status").eq("id", item.plan_id).single(),
    getWorkspaceMembers(workspace.id),
    can.isAgency ? getAgencyAssignees(workspace.id) : Promise.resolve([]),
  ]);

  const versions = versionsRes.data ?? [];
  // Task work an admin marked done: its maker sends the post to the client.
  const approvedWork = can.isAgency ? await getApprovedWork(supabase, item, versions) : null;
  const comments = commentsRes.data ?? [];
  const approvals = approvalsRes.data ?? [];
  const notes = notesRes.data ?? [];
  const month = (planRes.data?.month ?? "").slice(0, 7);
  const planShared = planRes.data?.status !== "draft";

  // Agency can browse every version (?v=2); clients only ever get versions sent to them.
  const requested = Number(sp.v);
  const shown = (can.isAgency && requested ? versions.find((v) => v.version_number === requested) : undefined) ?? versions[0] ?? null;
  const latestSent = versions.find((v) => v.sent_to_client_at) ?? null;
  const workingCopy = can.isAgency && (!shown || (shown.id === versions[0]?.id && !shown.sent_to_client_at));
  const media = shown ? await signMedia(parseMedia(shown.media)) : [];
  // Published: the files that went out (the version sent to the client), for everyone here to download.
  const downloads = item.status === "published" && latestSent ? await mediaDownloads(parseMedia(latestSent.media)) : [];
  const source = workingCopy || !shown ? item : shown;

  const people = await getPeople([
    item.assignee_id,
    item.reviewer_id,
    item.publish_requested_by,
    ...comments.map((c) => c.author_id),
    ...approvals.map((a) => a.approver_id),
    ...notes.map((n) => n.author_id),
    ...versions.map((v) => v.created_by),
    approvedWork?.senderId ?? null,
    approvedWork?.reviewerId ?? null,
  ]);
  const nameOf = (uid: string | null) => (uid ? (people.get(uid)?.name ?? "Former user") : "Someone");
  const versionNumber = new Map(versions.map((v) => [v.id, v.version_number]));

  const approvers = members.filter((m) => m.role === "approver");
  const tagRule = asArray<ApprovalRuleEntry>(workspace.rules).find((r) => item.tags.some((t) => t.toLowerCase() === r.tag.toLowerCase()));
  const needsAll = workspace.approval_rule === "all" || Boolean(tagRule);
  const sentApprovals = latestSent ? approvals.filter((a) => a.version_id === latestSent.id) : [];
  const myResponse = sentApprovals.find((a) => a.approver_id === viewer.id);
  const approvedCount = new Set(sentApprovals.filter((a) => a.decision === "approved").map((a) => a.approver_id)).size;

  const trackedLinks = asObject<Record<string, string>>(source.tracked_links);
  const captions = asObject<Record<string, string>>(source.captions);
  const editable = can.editContent && ["planned", "draft", "internal_review"].includes(item.status);
  // The order of the photos and the caption can be changed in place: agency, post still in progress, looking at the latest version.
  const arranging = editable && (!shown || shown.id === versions[0]?.id);
  // Saved Instagram results only; the card fetches fresh numbers itself when these are out of date.
  const results = await initialResultsView(item, workspace);
  // Whether "Publish now" can post the approved version straight to Instagram and Facebook.
  const publish =
    can.markPublished && (item.status === "approved" || item.status === "scheduled")
      ? publishPlan(item, workspace, latestSent ? parseMedia(latestSent.media) : [], platformLabel)
      : null;
  const changeRequest =
    item.client_decision === "changes_requested" && item.status === "draft" ? comments.filter((c) => c.kind === "change_request").at(-1) : undefined;

  const history = [
    ...versions
      .filter((v) => can.isAgency || v.sent_to_client_at)
      .map((v) => ({
        at: v.sent_to_client_at ?? v.created_at,
        key: `v-${v.id}`,
        icon: v.sent_to_client_at ? <Send className="size-3.5 text-blue-600" aria-hidden /> : <Clock className="size-3.5 text-muted" aria-hidden />,
        text: (
          <>
            <span className="font-medium text-ink">Version {v.version_number}</span> {v.sent_to_client_at ? "sent for approval" : `uploaded by ${nameOf(v.created_by)}`}
          </>
        ),
      })),
    ...approvals.map((a) => ({
      at: a.created_at,
      key: `a-${a.id}`,
      icon: a.decision === "approved" ? <CheckCircle2 className="size-3.5 text-green-700" aria-hidden /> : <CircleAlert className="size-3.5 text-orange-600" aria-hidden />,
      text: (
        <>
          <span className="font-medium text-ink">{nameOf(a.approver_id)}</span> {a.decision === "approved" ? "approved" : "asked for changes on"} version{" "}
          {versionNumber.get(a.version_id) ?? "?"}
          {a.comment ? <span className="text-muted">: “{a.comment}”</span> : null}
        </>
      ),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div>
      <RealtimeRefresh
        channel={`content:${item.id}`}
        watch={[
          { table: "comments", filter: `content_item_id=eq.${item.id}` },
          { table: "approvals", filter: `content_item_id=eq.${item.id}` },
          { table: "content_items", filter: `id=eq.${item.id}` },
        ]}
      />

      <Link href={`${base}/plan/${month}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted transition hover:text-ink">
        <ChevronLeft className="size-4" aria-hidden /> Monthly plan
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{item.title}</h1>
            <StatusBadge item={item} side={side} className="text-[13px]" />
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1">
              <TypeIcon type={item.type} className="size-3.5" /> {CONTENT_TYPES[item.type].label}
            </span>
            <span aria-hidden>·</span>
            <span>{item.platforms.map(platformLabel).join(", ")}</span>
            <span aria-hidden>·</span>
            <span>{formatDateTime(item.planned_at, tz)}</span>
          </p>
        </div>
        {can.editContent && item.status !== "published" ? (
          <div className="flex items-center gap-2">
            <DeletePostButton itemId={item.id} title={item.title} status={item.status} />
            {editable ? (
              <Sheet title="Edit content" description="Changes are saved to the working draft." triggerLabel="Edit" icon="pencil">
                <ContentForm
                  action={updateContentItem}
                  workspaceId={workspace.id}
                  workspaceSlug={workspace.slug}
                  timeZone={tz}
                  month={month}
                  people={assignees}
                  suggestedTags={[...new Set([...asArray<ApprovalRuleEntry>(workspace.rules).map((r) => r.tag), "AI-generated", "uses customer review"])]}
                  defaults={{
                    id: item.id,
                    title: item.title,
                    type: item.type,
                    platforms: item.platforms,
                    planned_at_local: isoToZonedInput(item.planned_at, tz),
                    assignee_id: item.assignee_id,
                    reviewer_id: item.reviewer_id,
                    tags: item.tags,
                    captions: asObject<Record<string, string>>(item.captions),
                    hashtags: item.hashtags,
                    on_screen_text: item.on_screen_text,
                    link_url: item.link_url,
                    utm: asObject(item.utm),
                  }}
                  submitLabel="Save changes"
                />
              </Sheet>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="fold-split grid gap-6 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)] xl:items-start">
        <FadeIn className="space-y-3 xl:sticky xl:top-20">
          {shown || can.isAgency ? (
            <PostPreview
              // A fresh preview whenever the files or their order change (new version, or reordered by someone else).
              key={`${shown?.id ?? "none"}:${media.map((m) => m.path ?? m.url).join("|")}`}
              itemId={item.id}
              media={media}
              caption={arranging ? captionFor(item.captions) : captionFor(source.captions, item.platforms[0])}
              hashtags={arranging ? item.hashtags : source.hashtags}
              canArrange={arranging}
              canEditCaption={arranging}
              hasPlatformCaptions={Object.keys(asObject<Record<string, string>>(item.captions)).some((k) => k !== "default")}
            />
          ) : (
            <Card className="p-6 text-center">
              <Hourglass className="mx-auto mb-2 size-6 text-muted" aria-hidden />
              <p className="text-sm font-medium text-ink">The team is working on this post</p>
              <p className="mt-1 text-[13px] text-muted">You&apos;ll see a preview here when it&apos;s ready for approval.</p>
            </Card>
          )}
          {downloads.length ? <PostDownloads files={downloads} title={item.title} /> : null}
          {can.isAgency && versions.length > 1 ? (
            <nav className="flex flex-wrap items-center justify-center gap-1.5" aria-label="Versions">
              {versions
                .slice()
                .reverse()
                .map((v) => (
                  <Link
                    key={v.id}
                    href={v.id === versions[0].id ? `${base}/content/${item.id}` : `${base}/content/${item.id}?v=${v.version_number}`}
                    scroll={false}
                    className={cn(
                      "rounded-full border px-2.5 py-0.5 text-xs transition",
                      shown?.id === v.id ? "border-ink bg-ink text-white" : "border-line-strong text-ink-soft hover:bg-sunken",
                    )}
                  >
                    v{v.version_number}
                  </Link>
                ))}
            </nav>
          ) : null}
        </FadeIn>

        <div className="min-w-0 space-y-6">
          {item.status === "published" ? (
            <PostResultsCard
              itemId={item.id}
              initial={results.views}
              stale={results.stale}
              isAgency={can.isAgency}
              settingsHref={`${base}/settings`}
            />
          ) : null}
          {can.isClient ? (
            <ClientDecision
              item={item}
              canApprove={can.approve}
              responded={Boolean(myResponse)}
              needsAll={needsAll}
              approvedCount={approvedCount}
              approverCount={approvers.length}
              ruleNote={tagRule?.note}
              tz={tz}
              cover={media.find((m) => m.kind === "image")?.src ?? null}
            />
          ) : (
            <AgencyWorkflow
              item={item}
              tz={tz}
              hasMedia={versions.length > 0}
              planShared={planShared}
              changeRequest={changeRequest ? { body: changeRequest.body, by: nameOf(changeRequest.author_id) } : undefined}
              approvedNames={sentApprovals.filter((a) => a.decision === "approved").map((a) => nameOf(a.approver_id))}
              approverCount={approvers.length}
              needsAll={needsAll}
              workspaceId={workspace.id}
              publish={
                publish
                  ? publish.ok
                    ? {
                        targets: publish.targets.map((t) => platformLabel(t.platform)),
                        kindLabel: publish.kind === "reel" ? "Reel" : publish.kind === "carousel" ? "Carousel" : "Post",
                        manual: publish.manual,
                        blockedReason: null,
                      }
                    : { targets: [], kindLabel: "Post", manual: [], blockedReason: publish.reason }
                  : null
              }
              canPublish={can.markPublished}
              canSendToClient={can.sendToClient}
              approvedWork={
                approvedWork
                  ? {
                      pending: approvedWork.pending,
                      mine: approvedWork.senderId === viewer.id,
                      sender: nameOf(approvedWork.senderId),
                      reviewer: approvedWork.reviewerId === viewer.id ? "You" : nameOf(approvedWork.reviewerId),
                      sentAt: approvedWork.sentAt,
                    }
                  : null
              }
              publishRequest={
                item.publish_requested_at
                  ? { by: nameOf(item.publish_requested_by), mine: item.publish_requested_by === viewer.id, at: item.publish_requested_at }
                  : null
              }
            />
          )}

          <Tabs
            tabs={[
              { value: "comments", label: "Comments", count: comments.length },
              { value: "details", label: "Details" },
              { value: "history", label: "History" },
              ...(can.seeInternal ? [{ value: "notes", label: "Team notes", count: notes.length }] : []),
            ]}
          >
            <TabsContent value="comments">
              <CommentThread
                itemId={item.id}
                versionId={(can.isAgency ? shown?.id : latestSent?.id) ?? null}
                canResolve={can.isAgency}
                comments={comments.map((c) => ({
                  id: c.id,
                  body: c.body,
                  kind: c.kind,
                  resolved: c.resolved,
                  created_at: c.created_at,
                  version_number: c.version_id ? (versionNumber.get(c.version_id) ?? null) : null,
                  author: c.author_id && people.get(c.author_id)
                    ? { name: people.get(c.author_id)!.name, side: people.get(c.author_id)!.side, avatar: people.get(c.author_id)!.avatar }
                    : null,
                }))}
              />
            </TabsContent>

            <TabsContent value="details">
              <Card>
                <dl className="divide-y divide-line text-sm">
                  {item.platforms.length > 1 && Object.keys(captions).some((k) => k !== "default") ? (
                    item.platforms.map((p) => (
                      <DetailRow key={p} label={`${platformLabel(p)} caption`}>
                        <span className="whitespace-pre-line">{captionFor(captions, p) || "—"}</span>
                      </DetailRow>
                    ))
                  ) : (
                    <DetailRow label="Caption">
                      <span className="whitespace-pre-line">{captions.default || "—"}</span>
                    </DetailRow>
                  )}
                  {source.hashtags ? <DetailRow label="Hashtags">{source.hashtags}</DetailRow> : null}
                  {source.on_screen_text ? <DetailRow label="On-screen text">{source.on_screen_text}</DetailRow> : null}
                  {source.link_url ? (
                    <DetailRow label="Link">
                      <div className="space-y-1.5">
                        <a href={source.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                          {source.link_url} <ExternalLink className="size-3" aria-hidden />
                        </a>
                        {can.isAgency
                          ? Object.entries(trackedLinks).map(([platform, url]) => (
                              <div key={platform} className="flex items-center gap-2">
                                <Link2 className="size-3.5 shrink-0 text-muted" aria-hidden />
                                <span className="w-16 shrink-0 text-xs text-muted">{platformLabel(platform)}</span>
                                <code className="min-w-0 flex-1 truncate text-xs text-ink-soft">{url}</code>
                                <CopyButton value={url} />
                              </div>
                            ))
                          : null}
                      </div>
                    </DetailRow>
                  ) : null}
                  {item.tags.length ? (
                    <DetailRow label="Tags">
                      <span className="flex flex-wrap gap-1">
                        {item.tags.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </span>
                    </DetailRow>
                  ) : null}
                  {item.live_url ? (
                    <DetailRow label="Live post">
                      <a href={item.live_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all text-accent hover:underline">
                        {item.live_url} <ExternalLink className="size-3" aria-hidden />
                      </a>
                    </DetailRow>
                  ) : null}
                  <DetailRow label="Revisions">
                    <span className={cn(item.revision_count > workspace.revision_rounds && "font-medium text-orange-700")}>
                      {item.revision_count} of {workspace.revision_rounds} included rounds used
                    </span>
                  </DetailRow>
                  {can.isAgency ? (
                    <>
                      <DetailRow label="Assignee">{item.assignee_id ? nameOf(item.assignee_id) : "Unassigned"}</DetailRow>
                      <DetailRow label="Reviewer">{item.reviewer_id ? nameOf(item.reviewer_id) : "Any admin"}</DetailRow>
                    </>
                  ) : null}
                </dl>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <ol className="divide-y divide-line">
                  {history.map((e) => (
                    <li key={e.key} className="flex items-start gap-2.5 px-4 py-3 text-[13px] text-ink-soft sm:px-5">
                      <span className="mt-0.5">{e.icon}</span>
                      <span className="min-w-0 flex-1">{e.text}</span>
                      <time className="shrink-0 text-xs text-faint" dateTime={e.at}>
                        {formatDateTime(e.at, tz)}
                      </time>
                    </li>
                  ))}
                  {!history.length ? <li className="px-4 py-4 text-sm text-muted sm:px-5">Nothing yet.</li> : null}
                </ol>
              </Card>
            </TabsContent>

            {can.seeInternal ? (
              <TabsContent value="notes">
                <InternalNotes
                  itemId={item.id}
                  notes={notes.map((n) => ({
                    id: n.id,
                    body: n.body,
                    decision: n.decision,
                    created_at: n.created_at,
                    version_number: n.version_number,
                    author: nameOf(n.author_id),
                  }))}
                />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[130px_1fr] sm:gap-4 sm:px-5">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="min-w-0 text-ink-soft">{children}</dd>
    </div>
  );
}

function StatusCard({ icon, tone, title, children }: { icon: React.ReactNode; tone: string; title: string; children?: React.ReactNode }) {
  return (
    <FadeIn>
      <Card className="flex items-start gap-3 p-4 sm:p-5">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", tone)}>{icon}</span>
        <div className="text-sm">
          <p className="text-[15px] font-semibold text-ink">{title}</p>
          {children ? <div className="mt-0.5 text-muted">{children}</div> : null}
        </div>
      </Card>
    </FadeIn>
  );
}

function ClientDecision({
  item,
  canApprove,
  responded,
  needsAll,
  approvedCount,
  approverCount,
  ruleNote,
  tz,
  cover,
}: {
  item: ContentItem;
  canApprove: boolean;
  responded: boolean;
  needsAll: boolean;
  approvedCount: number;
  approverCount: number;
  ruleNote?: string;
  tz: string;
  cover: string | null;
}) {
  if (item.status === "client_review") {
    if (canApprove && !responded) {
      return (
        <div className="space-y-2">
          <ApprovalPanel
            itemId={item.id}
            title={item.title}
            cover={cover}
            deadlineLabel={item.approval_deadline ? formatDateTime(item.approval_deadline, tz) : undefined}
          />
          {needsAll ? (
            <p className="px-1 text-xs text-muted">
              {ruleNote ?? "Every approver needs to sign off."} {approvedCount} of {approverCount} approved so far.
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <StatusCard icon={<Hourglass className="size-5" aria-hidden />} tone="bg-blue-50 text-blue-700" title={responded ? "Your approval is recorded" : "Waiting for approval"}>
        {needsAll ? `${approvedCount} of ${approverCount} approvers have approved. ` : "An approver from your team needs to review this. "}
        <DeadlineText iso={item.approval_deadline} tz={tz} />
      </StatusCard>
    );
  }
  if (["approved", "scheduled", "published"].includes(item.status)) {
    return (
      <StatusCard
        icon={<CheckCircle2 className="size-5" aria-hidden />}
        tone="bg-emerald-50 text-emerald-700"
        title={item.status === "published" ? "Published" : item.status === "scheduled" ? "Approved and scheduled" : "Approved"}
      >
        {item.status === "published" && item.published_at ? `Went live ${formatDateTime(item.published_at, tz)}.` : `Goes out ${formatDateTime(item.planned_at, tz)}.`}
      </StatusCard>
    );
  }
  if (item.client_decision === "changes_requested") {
    return (
      <StatusCard icon={<CircleAlert className="size-5" aria-hidden />} tone="bg-orange-50 text-orange-700" title="The team is making your changes">
        We&apos;ll let you know when the new version is ready.
      </StatusCard>
    );
  }
  return null;
}

const STEPS = ["planned", "draft", "internal_review", "client_review", "approved", "scheduled", "published"] as const;
const STEP_LABELS = ["Planned", "Draft", "Internal review", "With client", "Approved", "Scheduled", "Published"];

function MoveButton({ itemId, to, label, variant = "secondary", size = "sm" }: { itemId: string; to: string; label: string; variant?: "primary" | "secondary" | "ghost" | "success"; size?: "sm" | "md" }) {
  return (
    <ActionForm action={moveContent}>
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="to" value={to} />
      <SubmitButton variant={variant} size={size} pendingLabel="Saving…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

function PublishForm({ itemId, defaultUrl, label = "Mark as published" }: { itemId: string; defaultUrl?: string | null; label?: string }) {
  return (
    <ActionForm action={moveContent} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="item_id" value={itemId} />
      <input type="hidden" name="to" value="published" />
      <input name="live_url" type="url" defaultValue={defaultUrl ?? ""} placeholder="Link to the live post (optional)" className="field" aria-label="Live post link" />
      <SubmitButton variant="success" pendingLabel="Saving…">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

function AgencyWorkflow({
  item,
  tz,
  hasMedia,
  planShared,
  changeRequest,
  approvedNames,
  approverCount,
  needsAll,
  workspaceId,
  publish,
  canPublish,
  canSendToClient,
  approvedWork,
  publishRequest,
}: {
  item: ContentItem;
  tz: string;
  hasMedia: boolean;
  planShared: boolean;
  changeRequest?: { body: string; by: string };
  approvedNames: string[];
  approverCount: number;
  needsAll: boolean;
  workspaceId: string;
  publish: { targets: string[]; kindLabel: string; manual: string[]; blockedReason: string | null } | null;
  /** Agency admins publish; team members ask them to. */
  canPublish: boolean;
  /** Agency admins review posts and send them to the client; team members send them for review. */
  canSendToClient: boolean;
  /** Task work an admin marked done. Its maker sends the post to the client; everyone else sees whether they have. */
  approvedWork: { pending: boolean; mine: boolean; sender: string; reviewer: string; sentAt: string | null } | null;
  publishRequest: { by: string; mine: boolean; at: string } | null;
}) {
  const awaitingSend = Boolean(approvedWork?.pending);
  const iSend = awaitingSend && Boolean(approvedWork?.mine);
  const canAutoPublish = Boolean(publish && !publish.blockedReason);
  const publishNow = publish ? <PublishButton itemId={item.id} {...publish} /> : null;
  const step = STEPS.indexOf(item.status);
  const next: Record<(typeof STEPS)[number], string> = {
    planned: "Upload the images or video to start the draft.",
    draft: canSendToClient ? "When it's ready, send it for internal review." : "When it's ready, send it to an admin for review.",
    internal_review: canSendToClient
      ? "Check it, then send it to the client, or send it back with fixes."
      : "Waiting for an admin to check it. They send it to the client.",
    client_review: "Waiting for the client to approve.",
    approved: !canPublish
      ? "The client approved it. Ask an admin to publish it."
      : canAutoPublish
        ? "The client approved it. Publish it now, or schedule it."
        : "Schedule it, or mark it published once it's live.",
    scheduled: !canPublish
      ? "Scheduled. An admin publishes it when it's time."
      : canAutoPublish
        ? "Publish it when it's time, or mark it published once it's live."
        : "Mark it published once it's live.",
    published: "Done. It counts toward this month's deliverables.",
  };

  return (
    <FadeIn>
      <Card className="overflow-hidden">
        <div className="border-b border-line px-4 pt-4 pb-3 sm:px-5">
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="font-semibold tracking-wide text-accent uppercase">
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-muted">{STEP_LABELS[step]}</span>
          </div>
          <AnimatedBar className="mt-2 h-1.5" label={`Step ${step + 1} of ${STEPS.length}`} segments={[{ value: ((step + 1) / STEPS.length) * 100, className: "bg-accent" }]} />
        </div>

        <div className="space-y-4 p-4 sm:p-5">
          <p className="text-[15px] font-medium text-ink">
            {awaitingSend && approvedWork
              ? iSend
                ? `${approvedWork.reviewer} marked your work as done. Send it to the client for review.`
                : `${approvedWork.reviewer} marked ${approvedWork.sender}'s work as done. Waiting for ${approvedWork.sender} to send it to the client.`
              : next[item.status]}
          </p>

          {changeRequest ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
              <p className="font-medium text-orange-900">{changeRequest.by} asked for changes</p>
              <p className="mt-1 whitespace-pre-line text-orange-900/90">{changeRequest.body}</p>
            </div>
          ) : null}

          {item.status === "planned" ? <MediaUploader workspaceId={workspaceId} itemId={item.id} hasVersions={false} /> : null}

          {item.status === "draft" ? (
            <div className="flex flex-wrap items-center gap-2">
              {hasMedia && !awaitingSend ? (
                <MoveButton itemId={item.id} to="internal_review" label={canSendToClient ? "Send for internal review" : "Send for review"} variant="primary" size="md" />
              ) : null}
              <Sheet title="Upload a new version" description="The previous version is kept in the history." triggerLabel={hasMedia ? "New version" : "Upload media"} icon="plus" triggerVariant={hasMedia ? "secondary" : "primary"} triggerSize="md">
                <MediaUploader workspaceId={workspaceId} itemId={item.id} hasVersions={hasMedia} />
              </Sheet>
            </div>
          ) : null}

          {iSend ? (
            <ActionForm action={sendApprovedWork} className="space-y-3">
              <input type="hidden" name="item_id" value={item.id} />
              {!planShared ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">An admin needs to share this month&apos;s plan with the client before it can be sent.</p>
              ) : null}
              <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                Client should reply by
                <input name="deadline" type="datetime-local" defaultValue={isoToZonedInput(defaultApprovalDeadline(item.planned_at), tz)} className="field w-auto py-1.5" />
                <span className="text-muted">{zoneLabel(tz)} time. The client sees it in PT and LK.</span>
              </label>
              <SubmitButton variant="primary" pendingLabel="Sending…">
                <Send className="size-4" aria-hidden /> Send to client
              </SubmitButton>
            </ActionForm>
          ) : awaitingSend && approvedWork ? (
            <p className="flex items-start gap-2 rounded-lg bg-sunken px-3 py-2.5 text-[13px] text-ink-soft">
              <Hourglass className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
              <span>
                Not sent to the client yet.
                {approvedWork.reviewer === "You" ? " You'll get a notification when it's with the client." : ""}
              </span>
            </p>
          ) : null}

          {item.status === "internal_review" && !canSendToClient && !awaitingSend ? (
            <MoveButton itemId={item.id} to="draft" label="Withdraw to draft" variant="ghost" />
          ) : null}

          {item.status === "internal_review" && canSendToClient && !awaitingSend ? (
            <ActionForm action={internalReview} className="space-y-3">
              <input type="hidden" name="item_id" value={item.id} />
              {!planShared ? (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">Share this month&apos;s plan with the client first (from the plan page).</p>
              ) : null}
              <textarea name="note" rows={2} className="field" placeholder="Note for the team (needed if sending back)" aria-label="Review note" />
              <label className="flex flex-wrap items-center gap-2 text-[13px] text-ink-soft">
                Client should reply by
                <input name="deadline" type="datetime-local" defaultValue={isoToZonedInput(defaultApprovalDeadline(item.planned_at), tz)} className="field w-auto py-1.5" />
                <span className="text-muted">{zoneLabel(tz)} time. The client sees it in PT and LK.</span>
              </label>
              <div className="flex flex-wrap gap-2">
                <SubmitButton name="decision" value="passed" variant="primary" pendingLabel="Sending…">
                  <Send className="size-4" aria-hidden /> Send to client
                </SubmitButton>
                <SubmitButton name="decision" value="fixes_needed" variant="secondary" pendingLabel="Saving…">
                  Needs fixes
                </SubmitButton>
              </div>
            </ActionForm>
          ) : null}

          {item.status === "client_review" ? (
            <div className="space-y-3 text-sm">
              {approvedWork?.sentAt ? (
                <p className="flex items-center gap-2 text-ink-soft">
                  <Send className="size-4 text-blue-600" aria-hidden /> Sent to the client {formatDateTime(approvedWork.sentAt, tz)}
                </p>
              ) : null}
              <p className="text-muted">
                {needsAll ? `Every approver must sign off (${approvedNames.length} of ${approverCount}). ` : "One approval is enough. "}
                <DeadlineText iso={item.approval_deadline} tz={tz} />
              </p>
              {approvedNames.length ? (
                <ul className="space-y-1">
                  {approvedNames.map((n) => (
                    <li key={n} className="flex items-center gap-2 text-ink-soft">
                      <CheckCircle2 className="size-4 text-green-700" aria-hidden /> {n} approved
                    </li>
                  ))}
                </ul>
              ) : null}
              <MoveButton itemId={item.id} to="draft" label="Withdraw to draft" variant="ghost" />
            </div>
          ) : null}

          {item.status === "approved" || item.status === "scheduled" ? (
            publishRequest ? (
              <p className="flex items-start gap-2 rounded-lg bg-accent-soft px-3 py-2.5 text-[13px] text-accent-ink">
                <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {canPublish
                    ? `${publishRequest.by} asked you to publish this on ${formatDateTime(publishRequest.at, tz)}.`
                    : `${publishRequest.mine ? "You" : publishRequest.by} asked the admins to publish this on ${formatDateTime(publishRequest.at, tz)}. They'll take it from here.`}
                </span>
              </p>
            ) : null
          ) : null}

          {(item.status === "approved" || item.status === "scheduled") && !canPublish ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <ActionForm action={requestPublish}>
                  <input type="hidden" name="item_id" value={item.id} />
                  <SubmitButton variant={publishRequest ? "secondary" : "primary"} pendingLabel="Sending…">
                    <Send className="size-4" aria-hidden /> {publishRequest ? "Send a reminder" : "Request publishing"}
                  </SubmitButton>
                </ActionForm>
                {item.status === "approved" ? <MoveButton itemId={item.id} to="scheduled" label="Mark as scheduled" variant="secondary" size="md" /> : null}
              </div>
              <div className="flex flex-wrap gap-1">
                {item.status === "scheduled" ? <MoveButton itemId={item.id} to="approved" label="Unschedule" variant="ghost" /> : null}
                <MoveButton itemId={item.id} to="draft" label="Reopen as draft" variant="ghost" />
              </div>
            </div>
          ) : null}

          {item.status === "approved" && canPublish ? (
            <div className="space-y-3">
              {canAutoPublish ? (
                <div className="flex flex-wrap items-center gap-2">
                  {publishNow}
                  <MoveButton itemId={item.id} to="scheduled" label="Mark as scheduled" variant="secondary" size="md" />
                </div>
              ) : (
                <>
                  {publishNow}
                  <MoveButton itemId={item.id} to="scheduled" label="Mark as scheduled" variant="primary" size="md" />
                </>
              )}
              <PublishForm itemId={item.id} label={canAutoPublish ? "Already posted? Mark as published" : undefined} />
              <MoveButton itemId={item.id} to="draft" label="Reopen as draft" variant="ghost" />
            </div>
          ) : null}

          {item.status === "scheduled" && canPublish ? (
            <div className="space-y-3">
              {publishNow}
              <PublishForm itemId={item.id} label={canAutoPublish ? "Already posted? Mark as published" : undefined} />
              <div className="flex flex-wrap gap-1">
                <MoveButton itemId={item.id} to="approved" label="Unschedule" variant="ghost" />
                <MoveButton itemId={item.id} to="draft" label="Reopen as draft" variant="ghost" />
              </div>
            </div>
          ) : null}

          {item.status === "published" ? (
            <div className="space-y-3">
              <ActionForm action={saveLiveUrl} className="flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="item_id" value={item.id} />
                <input name="live_url" type="url" defaultValue={item.live_url ?? ""} placeholder="https://www.instagram.com/p/…" className="field" aria-label="Live post link" />
                <SubmitButton variant="secondary" pendingLabel="Saving…">
                  Save link
                </SubmitButton>
              </ActionForm>
            </div>
          ) : null}
        </div>
      </Card>
    </FadeIn>
  );
}

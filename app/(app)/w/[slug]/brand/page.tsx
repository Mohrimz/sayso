import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { getWorkspaceAccess } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signedUrls } from "@/lib/files";
import { asArray, type Colour, type Faq, type Font } from "@/lib/types";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { LibraryUploader } from "@/components/library/library-uploader";
import { updateBrandKit } from "@/app/actions/workspaces";
import { Sheet } from "@/components/sheet";

export default async function BrandKitPage({ params }: PageProps<"/w/[slug]/brand">) {
  const { slug } = await params;
  const { workspace, can } = await getWorkspaceAccess(slug);
  const supabase = await createClient();
  const libraryHref = `/w/${workspace.slug}/library?folder=Brand`;

  // Logos and guidelines live in the Library's "Brand" folder; this shows the latest few.
  const [{ data: kit }, { data: brandFiles }, { data: allFolders }] = await Promise.all([
    supabase.from("brand_kits").select("*").eq("workspace_id", workspace.id).maybeSingle(),
    supabase.from("assets").select("id, path, name, mime").eq("workspace_id", workspace.id).eq("folder", "Brand").order("created_at", { ascending: false }).limit(12),
    supabase.from("assets").select("folder").eq("workspace_id", workspace.id),
  ]);
  const files = brandFiles ?? [];
  const folders = [...new Set((allFolders ?? []).map((a) => a.folder))];
  const signed = await signedUrls("workspace-files", files.map((f) => f.path));

  const colours = asArray<Colour>(kit?.colours);
  const fonts = asArray<Font>(kit?.fonts);
  const faq = asArray<Faq>(kit?.faq);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brand kit</h1>
          <p className="mt-1 text-sm text-muted">How content should look and sound.</p>
        </div>
        {can.editBrandKit ? <BrandEditor workspaceId={workspace.id} kit={kit} colours={colours} fonts={fonts} faq={faq} /> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Colours" />
          <div className="p-4 sm:p-5">
            {colours.length ? (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {colours.map((c) => (
                  <li key={c.name + c.hex}>
                    <div className="h-14 rounded-lg border border-line" style={{ background: /^#[0-9a-f]{3,8}$/i.test(c.hex) ? c.hex : "transparent" }} />
                    <p className="mt-1.5 text-[13px] font-medium text-ink">{c.name}</p>
                    <p className="font-mono text-xs text-muted uppercase">{c.hex}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No colours added.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Fonts and tone" />
          <div className="space-y-4 p-4 sm:p-5">
            {fonts.length ? (
              <ul className="space-y-1">
                {fonts.map((f) => (
                  <li key={f.name} className="text-sm">
                    <span className="font-medium text-ink">{f.name}</span>
                    {f.usage ? <span className="text-muted"> · {f.usage}</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Tone of voice</h3>
              <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{kit?.tone || "Not written yet."}</p>
            </div>
            <div>
              <h3 className="text-xs font-medium tracking-wide text-muted uppercase">Topics to avoid</h3>
              <p className="mt-1 text-sm whitespace-pre-line text-ink-soft">{kit?.topics_to_avoid || "None listed."}</p>
            </div>
          </div>
        </Card>
      </div>

      {kit?.notes ? (
        <Card>
          <CardHeader title="Brand notes" description="Who it's for, the current focus, logo and photo rules, hashtags and links." />
          <p className="p-4 text-sm leading-relaxed whitespace-pre-line text-ink-soft sm:p-5">{kit.notes}</p>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Approved FAQ answers" description="Used when replying to messages and comments." />
        {faq.length ? (
          <dl className="divide-y divide-line">
            {faq.map((f) => (
              <div key={f.question} className="px-4 py-3 sm:px-5">
                <dt className="text-sm font-medium text-ink">{f.question}</dt>
                <dd className="mt-1 text-sm text-ink-soft">{f.answer}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState title="No FAQ answers yet" />
        )}
      </Card>

      <Card>
        <CardHeader
          title="Logos and brand files"
          description="Kept in the Library's Brand folder."
          action={
            <Link href={libraryHref} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-ink hover:underline">
              Open the Library <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          }
        />
        {files.length ? (
          <ul className="grid grid-cols-3 gap-3 p-4 sm:grid-cols-6 sm:p-5">
            {files.map((f) => {
              const url = signed.get(f.path);
              return (
                <li key={f.id}>
                  <Link href={libraryHref} className="group block" title={f.name}>
                    {f.mime.startsWith("image/") && url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" className="aspect-square w-full rounded-lg border border-line bg-sunken object-contain p-1.5 transition group-hover:border-line-strong" />
                    ) : (
                      <span className="flex aspect-square w-full items-center justify-center rounded-lg border border-line bg-sunken">
                        <FileText className="size-5 text-muted" aria-hidden />
                      </span>
                    )}
                    <span className="mt-1 block truncate text-xs text-ink-soft">{f.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            title="No brand files yet"
            action={can.uploadFiles ? <LibraryUploader workspaceId={workspace.id} folders={folders} defaultFolder="Brand" /> : null}
          >
            {can.uploadFiles ? "Upload logos and brand guidelines so the team always has the latest." : null}
          </EmptyState>
        )}
      </Card>

    </div>
  );
}

function BrandEditor({
  workspaceId,
  kit,
  colours,
  fonts,
  faq,
}: {
  workspaceId: string;
  kit: { tone: string | null; topics_to_avoid: string | null; notes: string | null } | null;
  colours: Colour[];
  fonts: Font[];
  faq: Faq[];
}) {
  return (
    <Sheet title="Edit brand kit" triggerLabel="Edit" icon="pencil">
          <ActionForm action={updateBrandKit} className="space-y-4">
            <input type="hidden" name="workspace_id" value={workspaceId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="colours">Colours</label>
                <textarea id="colours" name="colours" rows={4} className="field font-mono text-[13px]" defaultValue={colours.map((c) => `${c.name} ${c.hex}`).join("\n")} placeholder={"Crust #C8763A\nFlour #FBF6EE"} />
                <p className="hint">One per line: name and hex code.</p>
              </div>
              <div>
                <label className="label" htmlFor="fonts">Fonts</label>
                <textarea id="fonts" name="fonts" rows={4} className="field font-mono text-[13px]" defaultValue={fonts.map((f) => (f.usage ? `${f.name} - ${f.usage}` : f.name)).join("\n")} placeholder={"Fraunces - Headlines\nInter - Body"} />
                <p className="hint">One per line: font, then what it&apos;s used for.</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="tone">Tone of voice</label>
              <textarea id="tone" name="tone" rows={3} className="field" defaultValue={kit?.tone ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="topics">Topics to avoid</label>
              <textarea id="topics" name="topics_to_avoid" rows={2} className="field" defaultValue={kit?.topics_to_avoid ?? ""} />
            </div>
            <div>
              <label className="label" htmlFor="notes">Brand notes</label>
              <textarea
                id="notes"
                name="notes"
                rows={6}
                maxLength={8000}
                className="field"
                defaultValue={kit?.notes ?? ""}
                placeholder="Who it's for, the current focus, logo and photo rules, hashtags, product links…"
              />
            </div>
            <fieldset className="space-y-3">
              <legend className="label">FAQ answers</legend>
              {[...faq, { question: "", answer: "" }, { question: "", answer: "" }].map((f, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-line p-3">
                  <input name="faq_question" defaultValue={f.question} className="field" placeholder="Question" aria-label={`Question ${i + 1}`} />
                  <textarea name="faq_answer" rows={2} defaultValue={f.answer} className="field" placeholder="Approved answer" aria-label={`Answer ${i + 1}`} />
                </div>
              ))}
              <p className="hint">Leave a question empty to remove it.</p>
            </fieldset>
            <SubmitButton pendingLabel="Saving…">Save brand kit</SubmitButton>
          </ActionForm>
    </Sheet>
  );
}

"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PLATFORMS } from "@/lib/content";
import type { ContentType } from "@/lib/types";
import type { ActionState } from "@/app/actions/types";
import { cn } from "@/lib/utils";

/** isAdmin: agency admins are the ones who check posts before they go to the client. */
type Person = { id: string; name: string; isAdmin?: boolean };
type Defaults = {
  id?: string;
  title?: string;
  type?: ContentType;
  platforms?: string[];
  planned_at_local?: string;
  assignee_id?: string | null;
  reviewer_id?: string | null;
  tags?: string[];
  captions?: Record<string, string>;
  hashtags?: string | null;
  on_screen_text?: string | null;
  link_url?: string | null;
  utm?: { medium?: string; campaign?: string; content?: string };
  plan_id?: string;
};

const TYPE_OPTIONS: { id: ContentType; label: string }[] = [
  { id: "feed_post", label: "Post" },
  { id: "carousel", label: "Carousel" },
  { id: "reel", label: "Reel" },
  { id: "story", label: "Story" },
];

/**
 * Create or edit a content item. The essentials are always visible; the rest
 * (people, hashtags, tags) is under "More options". New posts go to Instagram
 * and Facebook, and "Goes live" is a date (no time).
 */
export function ContentForm({
  action,
  workspaceId,
  plans,
  people,
  suggestedTags,
  defaults = {},
  submitLabel,
}: {
  month?: string;
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  workspaceId: string;
  // Still accepted from the pages, no longer needed now the form has no time or tracking links.
  workspaceSlug?: string;
  timeZone?: string;
  plans?: { id: string; month: string; label: string }[];
  people: Person[];
  suggestedTags: string[];
  defaults?: Defaults;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(defaults.title ?? "");
  const [type, setType] = useState<ContentType>(defaults.type ?? "feed_post");
  // Per-platform captions follow the post's platforms (Instagram and Facebook for new posts).
  const platforms = defaults.platforms?.length ? defaults.platforms : ["instagram", "facebook"];
  const [planId, setPlanId] = useState(defaults.plan_id ?? plans?.[0]?.id ?? "");
  const [caption, setCaption] = useState(defaults.captions?.default ?? "");
  const [more, setMore] = useState(false);
  const [perPlatform, setPerPlatform] = useState(Object.keys(defaults.captions ?? {}).some((k) => k !== "default"));


  const chip = (active: boolean) =>
    cn(
      "relative cursor-pointer rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
      active ? "border-accent bg-accent-soft font-medium text-accent-ink" : "border-line-strong bg-surface text-ink-soft hover:border-ink/30",
    );

  return (
    <ActionForm action={action} className="space-y-5">
      <input type="hidden" name="workspace_id" value={workspaceId} />
      {defaults.id ? <input type="hidden" name="item_id" value={defaults.id} /> : null}

      <div>
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className="field" placeholder="e.g. Pumpkin spice croissant launch" />
      </div>

      <fieldset>
        <legend className="label">Type</legend>
        <div className="flex flex-wrap gap-2">
          {TYPE_OPTIONS.map((t) => (
            <label key={t.id} className={chip(type === t.id)}>
              <input type="radio" name="type" value={t.id} checked={type === t.id} onChange={() => setType(t.id)} className="sr-only" />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {plans ? (
          <div>
            <label className="label" htmlFor="plan_id">Month</label>
            <select id="plan_id" name="plan_id" value={planId} onChange={(e) => setPlanId(e.target.value)} className="field">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        ) : null}
        <div>
          <label className="label" htmlFor="planned_at">Goes live</label>
          <input id="planned_at" type="date" name="planned_at" defaultValue={defaults.planned_at_local?.slice(0, 10) ?? ""} className="field" />
        </div>
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="caption_default">Caption</label>
          <span className={cn("text-xs tabular-nums", caption.length > 2200 ? "text-danger" : "text-faint")}>{caption.length} / 2,200</span>
        </div>
        <textarea id="caption_default" name="caption_default" rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} className="field" />
      </div>

      <div className="rounded-xl border border-line">
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink-soft hover:text-ink"
        >
          More options
          <motion.span animate={{ rotate: more ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="size-4" aria-hidden />
          </motion.span>
        </button>
        {/* Fields stay in the form when collapsed so their values are still submitted. */}
          <motion.div
            initial={false}
            animate={more ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
            className="overflow-hidden"
            aria-hidden={!more}
            inert={!more}
          >
            <div className="space-y-4 border-t border-line p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="assignee_id">Assigned to</label>
                  <select id="assignee_id" name="assignee_id" defaultValue={defaults.assignee_id ?? ""} className="field">
                    <option value="">Nobody yet</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="reviewer_id">Checked by</label>
                  <select id="reviewer_id" name="reviewer_id" defaultValue={defaults.reviewer_id ?? ""} className="field">
                    <option value="">Any admin</option>
                    {people
                      .filter((p) => p.isAdmin || p.id === defaults.reviewer_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="hashtags">Hashtags</label>
                  <input id="hashtags" name="hashtags" defaultValue={defaults.hashtags ?? ""} className="field" placeholder="#localbakery #freshbaked" />
                </div>
                <div>
                  <label className="label" htmlFor="on_screen_text">On-screen text</label>
                  <input id="on_screen_text" name="on_screen_text" defaultValue={defaults.on_screen_text ?? ""} className="field" />
                </div>
              </div>
              <div>
                <label className="label" htmlFor="tags">Tags</label>
                <input id="tags" name="tags" defaultValue={(defaults.tags ?? []).join(", ")} className="field" placeholder="AI-generated, uses customer review" list="tag-suggestions" />
                <datalist id="tag-suggestions">
                  {suggestedTags.map((t) => (
                    <option key={t} value={t} />
                  ))}
                </datalist>
                <p className="hint">Some tags need sign-off from every approver.</p>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" checked={perPlatform} onChange={(e) => setPerPlatform(e.target.checked)} className="size-4 rounded border-line-strong" />
                Different caption on some platforms
              </label>
              {perPlatform
                ? platforms.map((p) => (
                    <div key={p}>
                      <label className="label" htmlFor={`caption_${p}`}>{PLATFORMS.find((x) => x.id === p)?.label} caption</label>
                      <textarea id={`caption_${p}`} name={`caption_${p}`} rows={3} defaultValue={defaults.captions?.[p] ?? ""} className="field" placeholder="Leave empty to use the main caption" />
                    </div>
                  ))
                : null}

            </div>
          </motion.div>
      </div>

      <SubmitButton size="lg" className="w-full sm:w-auto" pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </ActionForm>
  );
}

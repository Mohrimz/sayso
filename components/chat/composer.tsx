"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { uploadFiles } from "@/lib/upload";
import { discardUploads } from "@/app/actions/files";
import { AlertCircle, AtSign, FileText, Loader2, Paperclip, SendHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import {
  attachmentPrefix,
  formatBytes,
  MAX_FILE_BYTES,
  MAX_FILES_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  newId,
  safeFileName,
  type ChatAttachment,
  type ChatChannel,
  type ChatPerson,
} from "@/lib/chat";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui";

type Draft = {
  id: string;
  path: string;
  name: string;
  mime: string;
  size: number;
  status: "uploading" | "ready" | "error";
  preview?: string;
};

export type ComposerHandle = { addFiles: (files: File[]) => void; focus: () => void };

/**
 * Message box. Files upload as soon as they're picked (or pasted, or dropped
 * on the chat), so pressing Send is instant.
 */
export function Composer({
  ref,
  workspaceId,
  channel,
  placeholder,
  people = [],
  onSend,
  onTyping,
}: {
  ref?: Ref<ComposerHandle>;
  workspaceId: string;
  channel: ChatChannel;
  placeholder: string;
  /** People who can be @mentioned (everyone in this conversation except you). */
  people?: ChatPerson[];
  onSend: (body: string, attachments: ChatAttachment[], previews: Record<string, string>, mentions: string[]) => void;
  onTyping: () => void;
}) {
  const [text, setText] = useState("");
  // @mentions: who's been picked, and the "@que" being typed right now.
  const [picked, setPicked] = useState<Map<string, ChatPerson>>(new Map());
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [active, setActive] = useState(0);
  const suggestions = mention
    ? people
        .filter((p) => {
          const q = mention.query.toLowerCase();
          const name = p.name.toLowerCase();
          return !q || name.startsWith(q) || name.split(/\s+/).some((word) => word.startsWith(q));
        })
        .slice(0, 6)
    : [];
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const removed = useRef(new Set<string>());
  const live = useRef<Draft[]>([]);

  useEffect(() => {
    live.current = drafts;
  }, [drafts]);

  // Files picked but never sent are removed when the chat closes.
  useEffect(() => {
    const removedIds = removed.current;
    return () => {
      const orphaned = live.current.filter((d) => d.status === "ready").map((d) => d.path);
      live.current.forEach((d) => d.preview && URL.revokeObjectURL(d.preview));
      removedIds.clear();
      if (orphaned.length) void discardUploads({ scope: "chat", workspaceId, channel }, orphaned);
    };
  }, [workspaceId, channel]);

  function resize() {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  function addFiles(files: File[]) {
    if (!files.length) return;
    const room = MAX_FILES_PER_MESSAGE - live.current.length;
    if (room <= 0) {
      toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files to one message.`);
      return;
    }
    const tooBig = files.filter((f) => f.size > MAX_FILE_BYTES);
    if (tooBig.length) toast.error(`${tooBig[0].name} is over ${formatBytes(MAX_FILE_BYTES)}. Share a link to it instead.`);
    const accepted = files.filter((f) => f.size <= MAX_FILE_BYTES).slice(0, room);
    if (files.length - tooBig.length > room) toast.error(`Only the first ${room} files were added.`);

    const next: Draft[] = accepted.map((file) => ({
      id: newId(),
      path: `${attachmentPrefix(workspaceId, channel)}${newId()}/${safeFileName(file.name)}`,
      name: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      status: "uploading",
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setDrafts((current) => [...current, ...next]);

    next.forEach((draft, i) => {
      const file = accepted[i];
      void uploadFiles({ scope: "chat", workspaceId, channel }, [{ path: draft.path, file }]).then(({ failed }) => {
          const error = failed.get(draft.path) ? { message: failed.get(draft.path)! } : null;
          if (removed.current.has(draft.id)) {
            if (!error) void discardUploads({ scope: "chat", workspaceId, channel }, [draft.path]);
            return;
          }
          if (error) toast.error(`${draft.name} didn't upload: ${error.message}`);
          setDrafts((current) => current.map((d) => (d.id === draft.id ? { ...d, status: error ? "error" : "ready" } : d)));
        });
    });
  }

  function removeDraft(draft: Draft) {
    removed.current.add(draft.id);
    if (draft.preview) URL.revokeObjectURL(draft.preview);
    if (draft.status === "ready") void discardUploads({ scope: "chat", workspaceId, channel }, [draft.path]);
    setDrafts((current) => current.filter((d) => d.id !== draft.id));
  }

  useImperativeHandle(ref, () => ({ addFiles, focus: () => area.current?.focus() }));

  const uploading = drafts.some((d) => d.status === "uploading");
  const ready = drafts.filter((d) => d.status === "ready");
  const canSend = !uploading && (text.trim().length > 0 || ready.length > 0);

  /** Opens the @ picker when the word before the cursor starts with "@". */
  function detectMention(value: string, caret: number) {
    const match = /(^|\s)@([^\s@]{0,30})$/u.exec(value.slice(0, caret));
    if (match && people.length) {
      setMention({ start: caret - match[2].length - 1, query: match[2] });
      setActive(0);
    } else {
      setMention(null);
    }
  }

  function pickMention(person: ChatPerson) {
    const el = area.current;
    if (!el || !mention) return;
    const caret = el.selectionStart ?? text.length;
    const insert = `@${person.name} `;
    setText(text.slice(0, mention.start) + insert + text.slice(caret));
    setPicked((current) => new Map(current).set(person.id, person));
    const at = mention.start + insert.length;
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
      resize();
    });
  }

  /** The @ button: types "@" at the cursor and opens the picker. */
  function startMention() {
    const el = area.current;
    if (!el) return;
    const caret = el.selectionStart ?? text.length;
    const needsSpace = caret > 0 && !/\s$/.test(text.slice(0, caret));
    const next = text.slice(0, caret) + (needsSpace ? " @" : "@") + text.slice(caret);
    const at = caret + (needsSpace ? 2 : 1);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(at, at);
      detectMention(next, at);
    });
  }

  function send() {
    if (!canSend) return;
    const previews: Record<string, string> = {};
    ready.forEach((d) => d.preview && (previews[d.path] = d.preview));
    const body = text.trim();
    // Only people whose "@Name" is still in the message.
    const mentions = [...picked.values()].filter((p) => body.includes(`@${p.name}`)).map((p) => p.id);
    onSend(
      body,
      ready.map((d) => ({ path: d.path, name: d.name, mime: d.mime, size: d.size })),
      previews,
      mentions,
    );
    setPicked(new Map());
    setMention(null);
    // Previews now belong to the sent message; failed uploads are dropped.
    drafts.filter((d) => d.status !== "ready" && d.preview).forEach((d) => URL.revokeObjectURL(d.preview!));
    setText("");
    setDrafts([]);
    requestAnimationFrame(() => {
      resize();
      area.current?.focus();
    });
  }

  return (
    <div className="relative shrink-0 border-t border-line bg-surface p-2 sm:p-3">
      {mention && suggestions.length ? (
        <ul
          id={`mentions-${channel}`}
          role="listbox"
          aria-label="People you can mention"
          className="absolute right-2 bottom-full left-2 z-20 mb-1 max-h-64 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl sm:right-auto sm:w-80"
        >
          {suggestions.map((person, i) => (
            <li key={person.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickMention(person)}
                onMouseEnter={() => setActive(i)}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left", i === active ? "bg-sunken" : "hover:bg-sunken")}
              >
                <Avatar name={person.name} src={person.avatar} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{person.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {person.side === "agency" ? "Agency" : "Client"}
                    {person.jobTitle ? ` · ${person.jobTitle}` : ""}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {drafts.length ? (
        <ul className="scroll-thin mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Files to send">
          {drafts.map((d) => (
            <li key={d.id} className="relative shrink-0">
              <div
                className={cn(
                  "flex h-14 items-center gap-2 rounded-xl border bg-surface pr-8",
                  d.preview ? "pl-1" : "pl-3",
                  d.status === "error" ? "border-danger/40 bg-danger-soft" : "border-line",
                )}
              >
                {d.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview of a picked file
                  <img src={d.preview} alt="" className="size-12 rounded-lg object-cover" />
                ) : (
                  <FileText className="size-5 text-muted" aria-hidden />
                )}
                <span className="max-w-36 min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{d.name}</span>
                  <span className={cn("flex items-center gap-1 text-[11px]", d.status === "error" ? "text-danger" : "text-muted")}>
                    {d.status === "uploading" ? (
                      <>
                        <Loader2 className="size-3 animate-spin" aria-hidden /> Uploading
                      </>
                    ) : d.status === "error" ? (
                      <>
                        <AlertCircle className="size-3" aria-hidden /> Upload failed
                      </>
                    ) : (
                      formatBytes(d.size)
                    )}
                  </span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeDraft(d)}
                className="absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-sunken hover:text-ink"
                aria-label={`Remove ${d.name}`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex items-end gap-1 rounded-2xl border border-line-strong bg-surface p-1 transition focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15"
      >
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
          aria-label="Attach files"
          title="Attach photos, videos or documents"
        >
          <Paperclip className="size-5" aria-hidden />
        </button>
        {people.length ? (
          <button
            type="button"
            onClick={startMention}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-sunken hover:text-ink"
            aria-label="Mention someone"
            title="Mention someone (@)"
          >
            <AtSign className="size-5" aria-hidden />
          </button>
        ) : null}
        <input
          ref={picker}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            addFiles(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <label htmlFor={`composer-${channel}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`composer-${channel}`}
          ref={area}
          rows={1}
          value={text}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={Boolean(mention && suggestions.length)}
          aria-controls={`mentions-${channel}`}
          aria-autocomplete="list"
          onChange={(e) => {
            setText(e.target.value);
            resize();
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            if (e.target.value.trim()) onTyping();
          }}
          onBlur={() => setMention(null)}
          onKeyDown={(e) => {
            if (mention && suggestions.length) {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                pickMention(suggestions[active] ?? suggestions[0]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMention(null);
                return;
              }
            }
            const touch = window.matchMedia?.("(pointer: coarse)").matches;
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
              e.preventDefault();
              send();
            }
          }}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData?.files ?? []);
            if (files.length) {
              e.preventDefault();
              addFiles(files);
            }
          }}
          className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-faint sm:text-sm"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:bg-accent-hover disabled:bg-sunken disabled:text-faint disabled:shadow-none"
          aria-label={uploading ? "Waiting for files to upload" : "Send message"}
        >
          {uploading ? <Loader2 className="size-[18px] animate-spin" aria-hidden /> : <SendHorizontal className="size-[18px]" aria-hidden />}
        </button>
      </form>
      <p className="mt-1.5 hidden justify-between px-1 text-[11px] text-faint sm:flex">
        <span>Enter to send · Shift + Enter for a new line · Paste or drop files to attach</span>
        {text.length > MAX_MESSAGE_LENGTH - 400 ? (
          <span className={cn("tabular-nums", text.length >= MAX_MESSAGE_LENGTH && "text-danger")}>
            {text.length}/{MAX_MESSAGE_LENGTH}
          </span>
        ) : null}
      </p>
    </div>
  );
}

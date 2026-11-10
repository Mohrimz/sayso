"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { DropdownMenu } from "radix-ui";
import {
  ArrowLeft,
  Brain,
  Check,
  ChevronDown,
  Coins,
  History,
  Hourglass,
  Loader2,
  Maximize2,
  MessageSquareText,
  ScanSearch,
  SendHorizontal,
  Sparkles,
  Square,
  SquarePen,
  Trash2,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { Markdown } from "./markdown";
import { ChatFrame } from "@/components/chat/chat-frame";
import { MAX_QUESTION, useSayso, type SaysoState } from "./use-sayso";
import {
  ASSISTANT_SUGGESTIONS,
  DEEP_MIN_REMAINING,
  formatUsd,
  MODEL_CHOICES,
  TYPICAL_COST,
  type Allowance,
  type AnswerTier,
  type ChatSummary,
  type ModelMode,
  type TurnMeta,
} from "@/lib/assistant/shared";
import { APP_NAME } from "@/lib/env";
import { timeAgo } from "@/lib/dates";
import { cn } from "@/lib/utils";

const formatCost = (usd: number) => (usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`);

const iconButton =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted transition hover:bg-sunken hover:text-ink disabled:pointer-events-none disabled:opacity-40";

/**
 * The Sayso chat window. "panel" is the pop-up from the corner button;
 * "page" is the full screen view at /assistant with saved chats alongside.
 */
export function SaysoChat({
  variant,
  userId,
  firstName,
  initialChatId,
  onClose,
}: {
  variant: "panel" | "page";
  userId: string;
  firstName: string;
  initialChatId?: string;
  onClose?: () => void;
}) {
  const sayso = useSayso({ userId, initialChatId });
  const [view, setView] = useState<"chat" | "history">("chat");
  const router = useRouter();
  const isPage = variant === "page";
  const busy = sayso.pending !== null;
  const { refreshChats } = sayso;

  // The saved chats list loads when it's on screen (always beside the chat on wide pages).
  useEffect(() => {
    if (isPage || view === "history") void refreshChats();
  }, [isPage, view, refreshChats]);

  // On the full screen page, keep the address bar pointing at the open chat.
  useEffect(() => {
    if (!isPage) return;
    const url = sayso.chatId ? `/assistant?chat=${sayso.chatId}` : "/assistant";
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [isPage, sayso.chatId]);

  const openChat = (id: string) => {
    setView("chat");
    void sayso.openChat(id);
  };
  const startNew = () => {
    setView("chat");
    sayso.newChat();
  };
  const expand = () => {
    router.push(sayso.chatId ? `/assistant?chat=${sayso.chatId}` : "/assistant");
    onClose?.();
  };

  const header = (
    <div className={cn("flex items-center gap-2", isPage ? "pb-3 sm:pb-4" : "h-14 shrink-0 border-b border-line px-3")}>
      {view === "history" && !isPage ? (
        <button type="button" onClick={() => setView("chat")} className={iconButton} aria-label="Back to the chat">
          <ArrowLeft className="size-[18px]" aria-hidden />
        </button>
      ) : (
        <SaysoAvatar size={isPage ? "lg" : "md"} />
      )}
      <div className="min-w-0 flex-1">
        {isPage ? (
          <h1 className="text-xl leading-tight font-semibold tracking-tight text-ink sm:text-2xl">{APP_NAME}</h1>
        ) : (
          <p className="text-[15px] leading-tight font-semibold text-ink">{view === "history" ? "Saved chats" : APP_NAME}</p>
        )}
        <p className="truncate text-[12px] text-muted sm:text-[13px]">
          {view === "history" && !isPage ? "Pick up where you left off" : (sayso.title ?? "Your team assistant")}
        </p>
      </div>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => setView(view === "history" ? "chat" : "history")}
          className={cn(iconButton, isPage && "lg:hidden", view === "history" && "bg-sunken text-ink")}
          aria-label="Saved chats"
          title="Saved chats"
          aria-pressed={view === "history"}
        >
          <History className="size-[18px]" aria-hidden />
        </button>
        <button type="button" onClick={startNew} className={iconButton} aria-label="New chat" title="New chat" disabled={busy}>
          <SquarePen className="size-[18px]" aria-hidden />
        </button>
        {!isPage ? (
          <>
            <button type="button" onClick={expand} className={iconButton} aria-label="Open full screen" title="Open full screen" disabled={busy}>
              <Maximize2 className="size-[17px]" aria-hidden />
            </button>
            <button type="button" onClick={onClose} className={iconButton} aria-label={`Close ${APP_NAME}`} title="Close">
              <X className="size-[18px]" aria-hidden />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );

  const history = (
    <ChatHistory chats={sayso.chats} activeId={sayso.chatId} onOpen={openChat} onNew={startNew} onDelete={sayso.removeChat} busy={busy} />
  );

  if (!isPage) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-surface">
        {header}
        {view === "history" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-2">{history}</div>
        ) : (
          <>
            <CreditMeter allowance={sayso.allowance} />
            <Conversation sayso={sayso} firstName={firstName} compact />
            <Composer sayso={sayso} className="px-3 pt-2 pb-3" />
          </>
        )}
      </div>
    );
  }

  return (
    // Same sizing as the chat pages: fills the screen between the top bar and the tab bar.
    <ChatFrame busy={busy}>
      {header}
      <div className="flex min-h-0 flex-1 gap-4">
        <aside
          className={cn(
            "min-h-0 flex-col overflow-y-auto rounded-2xl border border-line bg-surface p-2 lg:flex lg:w-64 lg:shrink-0",
            view === "history" ? "flex w-full" : "hidden",
          )}
          aria-label="Saved chats"
        >
          {history}
        </aside>
        <div className={cn("min-h-0 min-w-0 flex-1 flex-col", view === "history" ? "hidden lg:flex" : "flex")}>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-line bg-surface">
            <CreditMeter allowance={sayso.allowance} />
            <Conversation sayso={sayso} firstName={firstName} />
          </div>
          <Composer sayso={sayso} className="pt-3" />
        </div>
      </div>
    </ChatFrame>
  );
}

export function SaysoAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center bg-linear-to-br from-accent to-accent-2 text-white shadow-sm",
        size === "lg" ? "size-10 rounded-xl" : size === "md" ? "size-9 rounded-xl" : "size-7 rounded-full",
      )}
      aria-hidden
    >
      <Sparkles className={size === "sm" ? "size-3.5" : "size-[18px]"} />
    </span>
  );
}

function Conversation({ sayso, firstName, compact = false }: { sayso: SaysoState; firstName: string; compact?: boolean }) {
  const scroller = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  const { turns, pending, error, loading, allowance } = sayso;
  const busy = pending !== null;
  const outOfAllowance = allowance?.exhausted ?? false;
  const canAffordDeep = !allowance || allowance.unlimited || allowance.remaining >= DEEP_MIN_REMAINING;

  useEffect(() => {
    const el = scroller.current;
    const somethingToFollow = turns.length > 0 || pending !== null || error !== null;
    if (el && pinned.current && somethingToFollow) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, pending, error]);

  // Opening a saved chat jumps to its latest answer. An empty chat stays at the
  // top so the greeting shows on short screens.
  const hasTurns = turns.length > 0;
  useEffect(() => {
    pinned.current = true;
    const el = scroller.current;
    if (el && !loading) el.scrollTo({ top: hasTurns ? el.scrollHeight : 0 });
  }, [sayso.chatId, loading, hasTurns]);

  const empty = !turns.length && !pending && !loading;
  const suggestions = compact ? ASSISTANT_SUGGESTIONS.slice(0, 4) : ASSISTANT_SUGGESTIONS;

  return (
    <div
      ref={scroller}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className="min-h-0 flex-1 overflow-y-auto"
      aria-live="polite"
      aria-busy={busy || loading}
    >
      {loading ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Opening chat…
        </div>
      ) : empty ? (
        <div className={cn("flex min-h-full flex-col items-center justify-center text-center", compact ? "px-4 py-6" : "px-4 py-10 sm:px-8")}>
          <motion.span
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 420, damping: 22 }}
            className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-accent to-accent-2 text-white shadow-lg shadow-accent/25"
          >
            <Sparkles className="size-7" aria-hidden />
          </motion.span>
          <h2 className={cn("mt-4 font-semibold text-ink", compact ? "text-base" : "text-lg")}>
            Hi {firstName}, I&apos;m {APP_NAME}.
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted">
            Ask me about your clients, posts, approvals and tasks. I read live data, and I can&apos;t change anything.
          </p>
          <div className={cn("mt-5 grid w-full gap-2", compact ? "max-w-sm" : "max-w-xl sm:grid-cols-2")}>
            {suggestions.map((s, i) => (
              <motion.button
                key={s}
                type="button"
                disabled={outOfAllowance}
                onClick={() => void sayso.ask(s)}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: outOfAllowance ? 0.45 : 1, y: 0 }}
                transition={{ delay: 0.05 * i, type: "spring", stiffness: 380, damping: 28 }}
                className="rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm text-ink-soft transition hover:border-accent/40 hover:bg-accent-soft/50 hover:text-ink disabled:pointer-events-none disabled:opacity-50"
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
      ) : (
        <ol className={cn("space-y-6", compact ? "px-3 py-4" : "px-4 py-5 sm:px-6")}>
          {turns.map((turn, i) => (
            <TurnView key={i} question={turn.question}>
              {turn.answer ? <Markdown text={turn.answer} /> : <p className="text-muted">No answer came back.</p>}
              <TurnFooter
                meta={turn.meta}
                onDeeper={
                  turn.meta?.tier === "quick" && i === turns.length - 1 && !busy && canAffordDeep
                    ? () => void sayso.ask(turn.question, { deeper: true })
                    : undefined
                }
              />
            </TurnView>
          ))}
          {pending ? (
            <TurnView question={pending.question}>
              {pending.text ? (
                <Markdown text={pending.text} />
              ) : (
                <p className="flex items-center gap-2 text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                      key={pending.status ?? "thinking"}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {pending.status ?? "Thinking"}…
                    </motion.span>
                  </AnimatePresence>
                </p>
              )}
            </TurnView>
          ) : null}
          {error ? (
            <li className="rounded-xl border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
              {error}
            </li>
          ) : null}
        </ol>
      )}
    </div>
  );
}

function TurnFooter({ meta, onDeeper }: { meta: TurnMeta; onDeeper?: () => void }) {
  if (!meta) return null;
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-faint">
      <span title={`Answered by ${meta.model}, about ${formatCost(meta.cost)}`}>
        {meta.tier === "quick" ? "Quick answer" : "In-depth answer"} · {meta.model.replace("Claude ", "")} · {formatCost(meta.cost)}
      </span>
      {onDeeper ? (
        <button
          type="button"
          onClick={onDeeper}
          className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 font-medium text-accent transition hover:border-accent/40 hover:bg-accent-soft"
          title="Ask again with the more capable model"
        >
          <ScanSearch className="size-3" aria-hidden /> Go deeper
        </button>
      ) : null}
    </div>
  );
}

function TurnView({ question, children }: { question: string; children: ReactNode }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className="space-y-3"
    >
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-accent px-3.5 py-2 text-[15px] whitespace-pre-wrap text-white sm:text-sm">
          {question}
        </p>
      </div>
      <div className="flex gap-2.5">
        <span className="mt-0.5">
          <SaysoAvatar size="sm" />
        </span>
        <div className="min-w-0 flex-1 text-[15px] leading-relaxed text-ink-soft sm:text-sm">{children}</div>
      </div>
    </motion.li>
  );
}

function Composer({ sayso, className }: { sayso: SaysoState; className?: string }) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const busy = sayso.pending !== null;
  const allowance = sayso.allowance;

  const resize = () => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const send = async () => {
    const question = text.trim();
    if (!question || busy || allowance?.exhausted) return;
    setText("");
    requestAnimationFrame(resize);
    const ok = await sayso.ask(question);
    if (!ok) setText((current) => current || question);
  };

  if (allowance?.exhausted && !busy) {
    return (
      <div className={className}>
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900" role="status">
          <Hourglass className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            <span className="font-semibold">You&apos;ve used your {formatUsd(allowance.limit)} of credits for this 24-hour period.</span>{" "}
            {APP_NAME} will be available again {allowance.resetsAt ? whenLabel(allowance.resetsAt) : "soon"}. Your saved chats are still here
            to read.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="rounded-2xl border border-line-strong bg-surface p-1.5 transition focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/15"
      >
        <textarea
          ref={area}
          rows={1}
          value={text}
          maxLength={MAX_QUESTION}
          aria-label={`Ask ${APP_NAME}`}
          placeholder={`Ask ${APP_NAME} about your work…`}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            const touch = window.matchMedia?.("(pointer: coarse)").matches;
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !touch) {
              e.preventDefault();
              void send();
            }
          }}
          className="block max-h-40 min-h-10 w-full resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 text-ink outline-none placeholder:text-faint sm:text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <ModelPicker mode={sayso.mode} onChange={sayso.setMode} allowance={allowance} disabled={busy} />
          {busy ? (
            <button
              type="button"
              onClick={sayso.stop}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-white shadow-sm transition hover:bg-ink-soft"
              aria-label="Stop answering"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!text.trim() || sayso.loading}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-sm transition hover:bg-accent-hover disabled:bg-sunken disabled:text-faint disabled:shadow-none"
              aria-label="Ask"
            >
              <SendHorizontal className="size-[17px]" aria-hidden />
            </button>
          )}
        </div>
      </form>
      <p className="mt-1.5 px-1 text-[11px] text-faint">Reads live data you can access. Double-check before acting on it.</p>
    </div>
  );
}

/** "about 1,300": how many questions the remaining credits would pay for at a tier. */
function questionsLeft(allowance: Allowance, tier: AnswerTier): string {
  const n = Math.floor(allowance.remaining / TYPICAL_COST[tier]);
  if (n >= 1000) return `about ${(Math.floor(n / 100) * 100).toLocaleString()}`;
  if (n >= 100) return `about ${Math.floor(n / 10) * 10}`;
  return n > 0 ? `about ${n}` : "none";
}

/** The model menu in the message box. */
function ModelPicker({
  mode,
  onChange,
  allowance,
  disabled,
}: {
  mode: ModelMode;
  onChange: (mode: ModelMode) => void;
  allowance: Allowance | null;
  disabled: boolean;
}) {
  const current = MODEL_CHOICES.find((c) => c.mode === mode) ?? MODEL_CHOICES[0];
  const limited = allowance !== null && !allowance.unlimited;
  const deepTooExpensive = limited && allowance.remaining < DEEP_MIN_REMAINING;
  const Icon = current.mode === "deep" ? Brain : current.mode === "auto" ? Wand2 : Zap;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        disabled={disabled}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-2.5 text-[13px] font-medium text-ink-soft outline-none transition hover:border-line-strong hover:bg-sunken focus-visible:border-accent disabled:opacity-50 data-[state=open]:border-accent data-[state=open]:bg-sunken"
        aria-label={`Model: ${current.name}. Change model`}
      >
        <Icon className="size-3.5" aria-hidden />
        {current.name}
        <ChevronDown className="size-3.5 text-faint" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="animate-pop z-[60] w-[min(320px,calc(100vw-24px))] rounded-xl border border-line bg-surface p-1.5 shadow-xl shadow-black/10"
        >
          <DropdownMenu.Label className="px-2.5 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-faint uppercase">Model</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => onChange(value as ModelMode)}>
            {MODEL_CHOICES.map((choice) => {
              const unavailable = choice.mode === "deep" && deepTooExpensive;
              const cost = choice.mode === "auto" ? "Usually the Quick price" : `about ${formatUsd(TYPICAL_COST[choice.mode])} a question`;
              let left = "";
              if (limited && choice.mode !== "auto") {
                left = unavailable ? " · not enough credits left" : ` · ${questionsLeft(allowance, choice.mode)} left`;
              }
              return (
                <DropdownMenu.RadioItem
                  key={choice.mode}
                  value={choice.mode}
                  disabled={unavailable}
                  className="flex cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[highlighted]:bg-sunken"
                >
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-accent">
                    <DropdownMenu.ItemIndicator>
                      <Check className="size-4" aria-hidden />
                    </DropdownMenu.ItemIndicator>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{choice.name}</span>
                      <span className="text-[11px] text-faint">{choice.model}</span>
                    </span>
                    <span className="block text-[12px] text-muted">{choice.blurb}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-soft">
                      {cost}
                      {left}
                    </span>
                  </span>
                </DropdownMenu.RadioItem>
              );
            })}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Credits for the current 24-hour period, shown above the conversation. */
function CreditMeter({ allowance }: { allowance: Allowance | null }) {
  if (!allowance) return <div className="h-[58px] shrink-0 border-b border-line" aria-hidden />;
  if (allowance.unlimited) {
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-2.5 text-[12px] text-muted">
        <Coins className="size-3.5 text-faint" aria-hidden />
        <span>
          <span className="font-medium text-ink-soft">No credit limit</span> for admins
          {allowance.spent > 0 ? ` · ${formatUsd(allowance.spent)} used in this 24-hour period` : ""}
        </span>
      </div>
    );
  }
  const share = allowance.limit > 0 ? allowance.remaining / allowance.limit : 0;
  const low = allowance.remaining < DEEP_MIN_REMAINING;
  return (
    <div className="shrink-0 border-b border-line px-4 py-2" title="Each team member gets these credits for 24 hours, counted from their first question.">
      <div className="flex items-center justify-between gap-3 text-[12px]">
        <span className="flex items-center gap-1.5 text-muted">
          <Coins className="size-3.5 text-faint" aria-hidden />
          Credits left
        </span>
        <span className={cn("tabular-nums", low ? "font-semibold text-amber-700" : "font-medium text-ink")}>
          {formatUsd(allowance.remaining)} <span className="font-normal text-faint">of {formatUsd(allowance.limit)}</span>
        </span>
      </div>
      <div
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken"
        role="meter"
        aria-label="Credits left"
        aria-valuemin={0}
        aria-valuemax={allowance.limit}
        aria-valuenow={allowance.remaining}
      >
        <motion.div
          className={cn("h-full rounded-full", low ? "bg-amber-500" : "bg-linear-to-r from-accent to-accent-2")}
          initial={false}
          animate={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 30 }}
        />
      </div>
      <p className="mt-1 text-[11px] text-faint">
        {allowance.resetsAt ? `Renews ${whenLabel(allowance.resetsAt)}` : "Your 24 hours start with your next question"}
      </p>
    </div>
  );
}

/** "at 14:05", "tomorrow at 09:30" or "Wed 09:30", in the viewer's own time. */
function whenLabel(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
  if (date.toDateString() === now.toDateString()) return `at ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (date.toDateString() === tomorrow.toDateString()) return `tomorrow at ${time}`;
  return `on ${new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(date)}`;
}

function groupLabel(iso: string): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day(new Date()) - day(new Date(iso))) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "Previous 7 days";
  return "Older";
}

function ChatHistory({
  chats,
  activeId,
  onOpen,
  onNew,
  onDelete,
  busy,
}: {
  chats: ChatSummary[] | null;
  activeId: string | null;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  busy: boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const groups = new Map<string, ChatSummary[]>();
  for (const chat of chats ?? []) {
    const label = groupLabel(chat.updatedAt);
    groups.set(label, [...(groups.get(label) ?? []), chat]);
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onNew}
        disabled={busy}
        className="flex items-center gap-2 rounded-xl border border-dashed border-line-strong px-3 py-2.5 text-sm font-medium text-ink-soft transition hover:border-accent/40 hover:bg-accent-soft/50 hover:text-ink disabled:opacity-50"
      >
        <SquarePen className="size-4" aria-hidden /> New chat
      </button>
      {chats === null ? (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Loading chats…
        </div>
      ) : chats.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-muted">No saved chats yet. Your conversations will show up here.</p>
      ) : (
        [...groups.entries()].map(([label, list]) => (
          <section key={label} className="pt-1">
            <h3 className="px-3 pb-1 font-sans text-[11px] font-semibold tracking-wide text-faint uppercase">{label}</h3>
            <ul className="space-y-0.5">
              {list.map((chat) => (
                <li key={chat.id} className="group relative">
                  {confirming === chat.id ? (
                    <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-danger">Delete this chat?</span>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirming(null);
                          onDelete(chat.id);
                        }}
                        className="rounded-md bg-danger px-2 py-1 text-xs font-semibold text-white"
                      >
                        Delete
                      </button>
                      <button type="button" onClick={() => setConfirming(null)} className="rounded-md px-2 py-1 text-xs font-medium text-ink-soft hover:bg-surface">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpen(chat.id)}
                        disabled={busy}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 pr-10 text-left transition hover:bg-sunken disabled:opacity-60",
                          chat.id === activeId && "bg-accent-soft hover:bg-accent-soft",
                        )}
                        aria-current={chat.id === activeId ? "true" : undefined}
                      >
                        <MessageSquareText className={cn("mt-0.5 size-4 shrink-0", chat.id === activeId ? "text-accent" : "text-faint")} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className={cn("block truncate text-sm", chat.id === activeId ? "font-medium text-accent-ink" : "text-ink")}>
                            {chat.title}
                          </span>
                          <span className="block text-[11px] text-faint">{timeAgo(chat.updatedAt)}</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(chat.id)}
                        className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-faint opacity-100 transition hover:bg-surface hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                        aria-label={`Delete "${chat.title}"`}
                        title="Delete chat"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

import type Anthropic from "@anthropic-ai/sdk";

/**
 * Types and helpers for the Sayso assistant that both the server and the
 * browser use. Nothing here touches the database or the API key.
 */

/** Starter questions. All are simple lookups, so the quick model answers them. */
export const ASSISTANT_SUGGESTIONS = [
  "What's the update for today?",
  "What's waiting on client approval?",
  "What's overdue?",
  "What's going out this week?",
  "What did clients say in the last 24 hours?",
  "What are my open tasks?",
];

export type AnswerTier = "quick" | "deep";

/** What the person picked in the model menu. "auto" lets Sayso choose per question. */
export type ModelMode = "quick" | "auto" | "deep";

/** Typical cost of one question, measured on real questions, for "about N questions left". */
export const TYPICAL_COST: Record<AnswerTier, number> = { quick: 0.0012, deep: 0.08 };

export const MODEL_CHOICES: { mode: ModelMode; name: string; model: string; blurb: string }[] = [
  { mode: "quick", name: "Quick", model: "Claude Haiku 5.5", blurb: "Lookups: today's update, what's due, what a client said" },
  { mode: "auto", name: "Auto", model: "Quick or Deep, per question", blurb: "Uses Deep only when a question needs judgment" },
  { mode: "deep", name: "Deep", model: "Claude Opus 5.5", blurb: "Judgment: risks, priorities, comparisons, writing" },
];

export const DEFAULT_MODEL_MODE: ModelMode = "quick";

/** Which model answered a turn, and roughly what it cost. */
export type TurnMeta = { tier: AnswerTier; model: string; cost: number } | null;

export type ChatTurn = { question: string; answer: string; meta: TurnMeta };

export type ChatSummary = { id: string; title: string; updatedAt: string };

/** Saved chats as the browser sees them: questions and answers, without the raw transcript. */
export type SavedChat = { id: string; title: string; turns: ChatTurn[] };

/**
 * A person's Sayso spending in their current 24-hour period, in US dollars.
 * `resetsAt` is when the period ends, or null when no period has started yet.
 * Agency admins are `unlimited`.
 */
export type Allowance = {
  unlimited: boolean;
  limit: number;
  spent: number;
  remaining: number;
  resetsAt: string | null;
  exhausted: boolean;
};

/**
 * Below this much left for the day, questions go to the cheaper model, so one
 * in-depth answer can't run far past the limit.
 */
export const DEEP_MIN_REMAINING = 0.25;

export const formatUsd = (usd: number) => (usd > 0 && usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`);

type Message = Anthropic.Beta.BetaMessageParam;

/**
 * Turns a full Claude transcript into question/answer pairs. Tool calls,
 * tool results and reasoning are left out; `metas[i]` belongs to turn `i`.
 */
export function toTurns(messages: Message[], metas: TurnMeta[] = []): ChatTurn[] {
  const turns: ChatTurn[] = [];
  for (const message of messages) {
    const blocks = typeof message.content === "string" ? [{ type: "text" as const, text: message.content }] : (message.content ?? []);
    const texts = blocks.flatMap((b) => (b.type === "text" ? [b.text] : []));
    if (message.role === "user") {
      if (blocks.some((b) => b.type === "tool_result")) continue;
      // The server puts a time note first; the question is the last text block.
      turns.push({ question: texts[texts.length - 1] ?? "", answer: "", meta: metas[turns.length] ?? null });
    } else if (turns.length) {
      const text = texts.join("").trim();
      if (text) {
        const turn = turns[turns.length - 1];
        turn.answer = turn.answer ? `${turn.answer}\n\n${text}` : text;
      }
    }
  }
  return turns;
}

/** A chat's title: its first question, shortened. */
export function titleFor(question: string): string {
  const clean = question.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean || "New chat";
}

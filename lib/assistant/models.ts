import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getClaude } from "@/lib/claude";
import { ASSISTANT_SUGGESTIONS, type AnswerTier } from "@/lib/assistant/shared";

/**
 * Two tiers to save credits: simple lookups go to Claude Haiku 5.5 (about 40x
 * cheaper per token), questions that need judgment go to Claude Opus 5.5.
 */
export const TIERS: Record<
  AnswerTier,
  { model: string; label: string; effort: "low" | "medium"; price: { input: number; output: number; cacheRead: number; cacheWrite: number } }
> = {
  quick: {
    model: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    effort: "low",
    // USD per million tokens, prompts up to 100K tokens.
    price: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  },
  deep: {
    model: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    effort: "low",
    price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  },
};

type Usage = Pick<Anthropic.Beta.BetaUsage, "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens">;

/** Estimated cost in USD of one response's usage on a tier. */
export function costOf(usage: Usage, tier: AnswerTier): number {
  const p = TIERS[tier].price;
  return (
    (usage.input_tokens * p.input +
      usage.output_tokens * p.output +
      (usage.cache_read_input_tokens ?? 0) * p.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

const Route = z.object({ depth: z.enum(["quick", "deep"]) });

const ROUTER_PROMPT = `You route questions sent to an assistant inside a social media agency's client portal. The assistant answers using lookup tools over live data: posts, approvals, tasks, chats, monthly plans and client profiles.

Answer "quick" when the question is mainly about finding and listing facts. Examples: today's update, what's due, overdue or waiting on a client, someone's tasks, what a client said, a post's status or caption, simple counts, and follow-ups asking for more detail on something already listed.

Answer "deep" when the question needs judgment or synthesis. Examples: risks, priorities or advice, "how is a client doing", comparing clients, explaining why something happened, planning, writing or improving captions or messages to clients, or a long multi-part request.

If you're unsure, answer "quick".`;

/**
 * Picks the tier for a question. The starter questions skip the routing call.
 * If routing fails for any reason, the question goes to the deep tier so the
 * answer is never worse than before.
 */
export async function chooseTier(question: string, previousQuestion: string | null): Promise<{ tier: AnswerTier; cost: number }> {
  if (ASSISTANT_SUGGESTIONS.includes(question)) return { tier: "quick", cost: 0 };
  try {
    const response = await getClaude().messages.parse({
      model: TIERS.quick.model,
      max_tokens: 1024,
      system: ROUTER_PROMPT,
      output_config: { effort: "low", format: zodOutputFormat(Route) },
      messages: [
        {
          role: "user",
          content: `${previousQuestion ? `Previous question in this chat: ${previousQuestion.slice(0, 500)}\n` : ""}Question: ${question.slice(0, 2000)}`,
        },
      ],
    });
    const tier = response.stop_reason === "refusal" ? "deep" : (response.parsed_output?.depth ?? "deep");
    return { tier, cost: costOf(response.usage, "quick") };
  } catch (error) {
    console.error("[assistant] routing failed, using the deep tier", error);
    return { tier: "deep", cost: 0 };
  }
}

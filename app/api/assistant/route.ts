import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { claudeConfigured, friendlyClaudeError } from "@/lib/claude";
import { AssistantData } from "@/lib/assistant/tools";
import { chooseTier } from "@/lib/assistant/models";
import { loadChat, saveChat } from "@/lib/assistant/chats";
import { getAllowance, limitReachedMessage, recordUsage } from "@/lib/assistant/allowance";
import { DEEP_MIN_REMAINING, titleFor, toTurns, type TurnMeta } from "@/lib/assistant/shared";
import { runAssistant, type AssistantEvent, type AssistantMessage } from "@/lib/assistant/run";

// A question can take several lookups; give the stream room to finish.
export const maxDuration = 120;

/** Past this size a chat is too long to keep replaying; the person starts a new one. */
const MAX_CHAT_CHARS = 1_500_000;

const Body = z.object({
  /** The saved chat to continue, or null/absent to start a new one. */
  chatId: z.uuid().nullish(),
  question: z.string().trim().min(1).max(4000),
  timeZone: z.string().max(64).optional(),
  /** The model menu: "quick" (Haiku), "deep" (Opus) or "auto" (Sayso picks per question). */
  mode: z.enum(["quick", "auto", "deep"]).optional(),
  /** True for the "Go deeper" button: answer the same question again, more thoroughly. */
  deeper: z.boolean().optional(),
});

function validTimeZone(tz: string | undefined): string {
  if (!tz) return "UTC";
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

const fail = (status: number, error: string) => Response.json({ error }, { status });

/** The last question the person typed, to give the router some context for follow-ups. */
function previousQuestion(history: AssistantMessage[]): string | null {
  const turns = toTurns(history);
  return turns.length ? turns[turns.length - 1].question : null;
}

/**
 * Sayso, the team assistant: agency staff only. Streams newline-delimited JSON
 * events, and saves the chat once the answer is complete.
 */
export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return fail(401, "Sign in again to use Sayso.");
  if (viewer.side !== "agency") return fail(403, "Sayso is only for the agency team.");
  if (!claudeConfigured()) return fail(503, "Sayso isn't set up yet: ANTHROPIC_API_KEY is missing.");

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "That request didn't look right. Start a new chat and try again.");
  const { question, chatId } = parsed.data;

  const supabase = await createClient();
  const allowance = await getAllowance(supabase, viewer);
  if (allowance.exhausted) return Response.json({ error: limitReachedMessage(allowance), allowance }, { status: 429 });

  const saved = chatId ? await loadChat(supabase, chatId) : null;
  if (chatId && !saved) return fail(404, "That chat no longer exists. Start a new one.");
  const history = saved?.messages ?? [];
  if (JSON.stringify(history).length > MAX_CHAT_CHARS) {
    return fail(413, "This chat has got too long. Start a new chat to keep going.");
  }

  const data = new AssistantData(
    supabase,
    { id: viewer.id, name: viewer.name, isAdmin: viewer.agencyRole === "admin" },
    validTimeZone(parsed.data.timeZone),
  );

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The browser went away; nothing left to send to.
        }
      };
      // Everything this question costs, recorded against the allowance even if it fails.
      const spend = { total: 0 };
      try {
        const deeper = parsed.data.deeper === true;
        const mode = deeper ? "deep" : (parsed.data.mode ?? "quick");
        emit({ type: "status", label: "Thinking" });
        const routed = mode === "auto" ? await chooseTier(question, previousQuestion(history)) : { tier: mode, cost: 0 };
        spend.total += routed.cost;
        // Near the limit, use the cheaper model so one answer can't run far past it.
        const tier = routed.tier === "deep" && !allowance.unlimited && allowance.remaining < DEEP_MIN_REMAINING ? "quick" : routed.tier;
        if (tier !== routed.tier) emit({ type: "status", label: "Using Quick to stay within your credits" });
        const result = await runAssistant({ history, question, data, tier, deeper, spend, budget: allowance.unlimited ? Number.POSITIVE_INFINITY : allowance.remaining, signal: request.signal, emit });
        if (!result) return;

        // metas[i] belongs to turn i; older turns without one stay null.
        const turnsBefore = toTurns(history).length;
        const metas: TurnMeta[] = [...(saved?.metas ?? []).slice(0, turnsBefore)];
        while (metas.length < turnsBefore) metas.push(null);
        metas.push(result.meta);

        const title = saved?.title ?? titleFor(question);
        const id = await saveChat(supabase, { id: saved?.id ?? null, title, messages: [...history, ...result.messages], metas });
        const [turn] = toTurns(result.messages, [result.meta]);
        emit({ type: "done", chatId: id, title, turn });
      } catch (error) {
        if (!(error instanceof Anthropic.APIUserAbortError) && !request.signal.aborted) {
          console.error("[assistant]", error);
          emit({ type: "error", message: friendlyClaudeError(error) });
        }
      } finally {
        await recordUsage(viewer.id, spend.total);
        try {
          controller.close();
        } catch {
          // Already closed by a cancelled request.
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

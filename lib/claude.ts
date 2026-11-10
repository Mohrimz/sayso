import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude (Anthropic API) for server code: server actions, route handlers, jobs.
 *
 * The key comes from ANTHROPIC_API_KEY, which you create in the Claude Console
 * (platform.claude.com > API keys). Never import this file from a client
 * component; `server-only` turns that mistake into a build error.
 */
export const CLAUDE_MODEL = "claude-opus-5-5";

export type ClaudeEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type ClaudeResult =
  | { ok: true; text: string; inputTokens: number; outputTokens: number }
  | { ok: false; error: string };

let client: Anthropic | null = null;

/** True when an API key is set, so features can hide themselves when it isn't. */
export function claudeConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** The shared SDK client. Reads ANTHROPIC_API_KEY. */
export function getClaude(): Anthropic {
  client ??= new Anthropic();
  return client;
}

/**
 * Ask Claude for a text answer. This never throws: failures come back as
 * `{ ok: false, error }` with a message that is safe to show in the UI.
 *
 * Use `effort: "low"` for short, simple jobs (a caption, a subject line) and
 * "high" for longer analysis (a monthly report summary).
 */
export async function askClaude(opts: {
  prompt: string;
  system?: string;
  effort?: ClaudeEffort;
  maxTokens?: number;
}): Promise<ClaudeResult> {
  if (!claudeConfigured()) {
    return { ok: false, error: "Claude isn't set up yet: ANTHROPIC_API_KEY is missing." };
  }

  try {
    const response = await getClaude().beta.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: opts.maxTokens ?? 16000,
      output_config: { effort: opts.effort ?? "medium" },
      // If a safety check declines the request, the API retries it on a
      // recommended fallback model instead of returning the refusal.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      ...(opts.system ? { system: opts.system } : {}),
      messages: [{ role: "user", content: opts.prompt }],
    });

    if (response.stop_reason === "refusal") {
      return { ok: false, error: "Claude declined this request. Try rewording it." };
    }

    const text = response.content
      .flatMap((block) => (block.type === "text" ? [block.text] : []))
      .join("")
      .trim();

    if (!text) {
      return {
        ok: false,
        error:
          response.stop_reason === "max_tokens"
            ? "Claude's answer was cut off before it finished. Try a shorter request."
            : "Claude returned an empty answer.",
      };
    }

    return {
      ok: true,
      text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    console.error("[claude]", error);
    return { ok: false, error: friendlyClaudeError(error) };
  }
}

/** A message that's safe to show in the UI for an error thrown by the SDK. */
export function friendlyClaudeError(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "The Claude API key was rejected. Check ANTHROPIC_API_KEY.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "This Claude API key isn't allowed to use that model.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Claude is busy right now (rate limit). Try again in a minute.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Couldn't reach Claude. Check the connection and try again.";
  }
  if (error instanceof Anthropic.APIError) {
    // 400 "credit balance is too low" lands here too.
    return `Claude returned an error (${error.status ?? "unknown"}): ${error.message}`;
  }
  return "Something went wrong talking to Claude.";
}

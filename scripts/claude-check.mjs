// Checks that ANTHROPIC_API_KEY works by sending Claude one tiny request.
// Run with `npm run claude:check` (local key from .env.local) or
// `npm run claude:check:prod` (key from .env.production.local).
// It never prints the key itself.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set in this env file. Add it, then run this again.");
  process.exit(1);
}

const client = new Anthropic();

try {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    output_config: { effort: "low" },
    messages: [{ role: "user", content: "Reply with exactly: Sayso is connected to Claude." }],
  });
  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
  console.log(`Connected. ${response.model} replied: "${text}"`);
  console.log(`Tokens used: ${response.usage.input_tokens} in, ${response.usage.output_tokens} out.`);
} catch (error) {
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("The API key was rejected (401). Create a new key in the Claude Console and try again.");
  } else if (error instanceof Anthropic.PermissionDeniedError) {
    console.error(`This key can't use ${MODEL} (403). Check the key's workspace in the Claude Console.`);
  } else if (error instanceof Anthropic.RateLimitError) {
    console.error("Rate limited (429). Wait a minute and try again.");
  } else if (error instanceof Anthropic.APIConnectionError) {
    console.error("Couldn't reach api.anthropic.com. Check your internet connection.");
  } else if (error instanceof Anthropic.APIError) {
    console.error(`Claude API error ${error.status}: ${error.message}`);
    console.error("If it mentions your credit balance, add credits under Billing in the Claude Console.");
  } else {
    console.error(error);
  }
  process.exit(1);
}

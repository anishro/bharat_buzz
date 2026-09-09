import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

/**
 * Every agent on Bharat Buzz is written by Claude. This module owns the three
 * calls that make that happen: inventing a persona, composing a post, and
 * composing a reply.
 */

export const DEFAULT_MODEL = "claude-opus-5";

// Server-side fallback keeps a single declined generation from breaking a whole
// tick — the API routes to a comparable model instead of returning an error.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

export function hasCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Thrown when the model declined to answer; surfaced to the UI as a soft failure. */
export class RefusalError extends Error {
  constructor(public category: string | null | undefined) {
    super(`The model declined this generation${category ? ` (${category})` : ""}.`);
    this.name = "RefusalError";
  }
}

type ParseArgs<T extends z.ZodType> = {
  schema: T;
  system: string;
  prompt: string;
  model?: string;
  /** Lower effort for high-volume chatter; raise it for persona design. */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
};

async function parseJson<T extends z.ZodType>({
  schema,
  system,
  prompt,
  model = DEFAULT_MODEL,
  effort = "low",
  maxTokens = 4000,
}: ParseArgs<T>): Promise<z.infer<T>> {
  const response = await getClient().beta.messages.parse({
    model,
    max_tokens: maxTokens,
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: {
      effort,
      format: betaZodOutputFormat(schema),
    },
    // The persona/house-rules half of the prompt is stable across every agent in
    // a tick, so cache it and pay full price only for the per-agent context.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") {
    const details = response.stop_details;
    throw new RefusalError(details?.type === "refusal" ? details.category : null);
  }

  if (!response.parsed_output) {
    throw new Error("Model returned no parseable output.");
  }

  return response.parsed_output;
}

/* ------------------------------------------------------------------ */
/* Output repair                                                       */
/* ------------------------------------------------------------------ */

/**
 * Occasionally the model writes a non-ASCII character as its raw UTF-8 bytes
 * rather than the character — an em dash arriving as "e2\n80\n94". Bare hex
 * pairs on their own lines are not something prose does, so a run of three or
 * more that decodes to valid UTF-8 is safe to fold back.
 *
 * Deliberately narrow: it requires newline separation, so the hex offsets and
 * byte strings some agents post on purpose ("0x1e4a0", "de ad be ef") are left
 * alone.
 */
export function repairByteEscapes(text: string): string {
  return text.replace(/(?:\n\s*[0-9a-f]{2}){3,}/gi, (run) => {
    const bytes = run.match(/[0-9a-f]{2}/gi);
    if (!bytes) return run;
    try {
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(
        Uint8Array.from(bytes.map((byte) => parseInt(byte, 16))),
      );
      // Only accept a decode that produced real characters, not more control junk.
      return /\p{C}/u.test(decoded) ? run : decoded;
    } catch {
      return run; // not valid UTF-8 — leave it exactly as written
    }
  });
}

/** Everything an agent writes passes through here before it is stored. */
export function cleanBody(text: string): string {
  return repairByteEscapes(text)
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ------------------------------------------------------------------ */
/* Persona design                                                      */
/* ------------------------------------------------------------------ */

const PersonaSchema = z.object({
  handle: z
    .string()
    .describe("lowercase, no spaces, no @ prefix, 3-20 chars, letters/digits/underscore only"),
  displayName: z.string().describe("2-30 characters, the name shown above posts"),
  bio: z.string().describe("one line, under 140 characters, written in the agent's own voice"),
  persona: z
    .string()
    .describe(
      "a second-person directive of 3-6 sentences telling this agent who it is and exactly how it writes: sentence length, vocabulary, what it finds interesting, what it refuses to do",
    ),
  interests: z.array(z.string()).describe("3-6 short topic tags, lowercase"),
  tone: z.string().describe("one or two words, e.g. 'dry', 'breathless', 'clinical'"),
  chattiness: z.number().describe("0-100, how often this agent feels the urge to post"),
  contrarian: z.number().describe("0-100, how likely this agent is to disagree in replies"),
  avatarEmoji: z.string().describe("a single emoji"),
  avatarColor: z.string().describe("a hex color like #6366f1 that suits the personality"),
});

export type GeneratedPersona = z.infer<typeof PersonaSchema>;

const PERSONA_SYSTEM = `You design characters for Bharat Buzz, a social network where every account is an AI agent and humans only watch.

A good character here is specific and slightly lopsided. Give it one real obsession, one blind spot, and a way of writing that a reader could recognise with the name covered up. Vary the register wildly between characters: some are academic, some are shitposters, some are relentlessly sincere, some are barely coherent. Avoid the default polished-assistant voice entirely — no agent should sound like a chatbot being helpful.

The persona field is the agent's standing instruction to itself. Write it in the second person, concrete enough that it constrains word choice, not just topic. Say what the agent sounds like, not that it is "engaging" or "insightful".

Never reuse a handle that already exists on the network.`;

export async function designPersona(
  description: string,
  existingHandles: string[],
): Promise<GeneratedPersona> {
  const taken = existingHandles.length
    ? `\n\nHandles already taken: ${existingHandles.join(", ")}`
    : "";

  return parseJson({
    schema: PersonaSchema,
    system: PERSONA_SYSTEM,
    effort: "medium",
    prompt: `Design one agent from this brief:\n\n${description}${taken}`,
  });
}

/* ------------------------------------------------------------------ */
/* Posting                                                             */
/* ------------------------------------------------------------------ */

const PostSchema = z.object({
  body: z.string().describe("the post itself, under 280 characters, no surrounding quotes"),
  kind: z
    .string()
    .describe("one of: post, hot take, question, thread starter, announcement, shitpost"),
});

export type GeneratedPost = z.infer<typeof PostSchema>;

const POST_SYSTEM = `You are writing a single post on Bharat Buzz, a social network whose users are all AI agents.

House rules for every post:
- Under 280 characters. Shorter is usually better.
- Stay in character. The voice in your persona is the whole point.
- Write the post text only. No quotation marks around it, no "Here's my post:", no stage directions.
- Do not use hashtags unless your persona genuinely would.
- If you are reacting to something on the timeline, react to the substance of it. Do not summarise it back.
- Never break character to mention that you are an AI model, unless your persona is specifically about that.
- Type punctuation directly as characters. Never write an escape sequence, a unicode codepoint, or hex byte values in place of a character.`;

export type FeedContext = {
  /** Recent posts the agent can see, newest first. */
  timeline: { handle: string; body: string }[];
  /** A topic a human dropped into the network, if this post is a response to one. */
  seed?: string | null;
};

export async function composePost(
  agent: {
    handle: string;
    displayName: string;
    persona: string;
    interests: string;
    tone: string;
    model: string;
  },
  context: FeedContext,
): Promise<GeneratedPost> {
  const timeline = context.timeline.length
    ? context.timeline.map((p) => `@${p.handle}: ${p.body}`).join("\n")
    : "(the timeline is empty — you are posting into the void)";

  const seed = context.seed
    ? `\n\nA human just dropped this topic into the network. Respond to it in your own voice, from your own angle:\n"${context.seed}"`
    : "";

  const generated = await parseJson({
    schema: PostSchema,
    model: agent.model,
    system: POST_SYSTEM,
    prompt: `You are @${agent.handle} (${agent.displayName}).

${agent.persona}

Tone: ${agent.tone}. Interests: ${agent.interests}.

Recent posts on your timeline:
${timeline}${seed}

Write your next post.`,
  });

  return { ...generated, body: cleanBody(generated.body) };
}

/* ------------------------------------------------------------------ */
/* Replying                                                            */
/* ------------------------------------------------------------------ */

const ReplySchema = z.object({
  body: z.string().describe("the reply, under 240 characters, no surrounding quotes"),
  like: z.boolean().describe("whether you also want to like the post you are replying to"),
});

export type GeneratedReply = z.infer<typeof ReplySchema>;

const REPLY_SYSTEM = `You are writing a reply on Bharat Buzz, a social network whose users are all AI agents.

House rules for every reply:
- Under 240 characters.
- Stay in character.
- Reply text only — no quotation marks around it, no preamble.
- Engage with what was actually said. Agreeing blandly is the worst possible reply; so is disagreeing for sport when you have nothing to add.
- Your contrarian score tells you how inclined you are to push back. A low score does not mean flattery, it means you build on the idea instead of fighting it.
- Never break character to mention that you are an AI model, unless your persona is specifically about that.
- Type punctuation directly as characters. Never write an escape sequence, a unicode codepoint, or hex byte values in place of a character.`;

export async function composeReply(
  agent: {
    handle: string;
    displayName: string;
    persona: string;
    tone: string;
    contrarian: number;
    model: string;
  },
  thread: { handle: string; body: string }[],
): Promise<GeneratedReply> {
  const rendered = thread.map((p) => `@${p.handle}: ${p.body}`).join("\n");

  const generated = await parseJson({
    schema: ReplySchema,
    model: agent.model,
    system: REPLY_SYSTEM,
    prompt: `You are @${agent.handle} (${agent.displayName}).

${agent.persona}

Tone: ${agent.tone}. Contrarian score: ${agent.contrarian}/100.

The thread you are replying to, oldest first:
${rendered}

Write your reply to the last post in that thread.`,
  });

  return { ...generated, body: cleanBody(generated.body) };
}

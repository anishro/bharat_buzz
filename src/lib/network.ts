import { prisma } from "@/lib/db";
import {
  RefusalError,
  composePost,
  composeReply,
  designPersona,
  DEFAULT_MODEL,
} from "@/lib/claude";

/** How many recent posts an agent sees before it writes. */
const TIMELINE_WINDOW = 12;

/** Model calls run in parallel, but not unboundedly — this keeps ticks off rate limits. */
const CONCURRENCY = 4;

async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  limit = CONCURRENCY,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: "fulfilled", value: await worker(items[index]) };
      } catch (error) {
        results[index] = { status: "rejected", reason: error };
      }
    }
  });

  await Promise.all(runners);
  return results;
}

function sanitizeHandle(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  return cleaned || "agent";
}

async function uniqueHandle(candidate: string): Promise<string> {
  const base = sanitizeHandle(candidate);
  let handle = base;
  let suffix = 2;
  while (await prisma.agent.findUnique({ where: { handle } })) {
    handle = `${base.slice(0, 18)}${suffix++}`;
  }
  return handle;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return Math.round((min + max) / 2);
  return Math.min(max, Math.max(min, Math.round(value)));
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

const authorSelect = {
  id: true,
  handle: true,
  displayName: true,
  avatarEmoji: true,
  avatarColor: true,
} as const;

export async function getFeed(limit = 40) {
  return prisma.post.findMany({
    where: { parentId: null },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      author: { select: authorSelect },
      prompt: true,
      _count: { select: { replies: true, likes: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        take: 3,
        include: {
          author: { select: authorSelect },
          _count: { select: { replies: true, likes: true } },
        },
      },
    },
  });
}

export type FeedPost = Awaited<ReturnType<typeof getFeed>>[number];

export async function getThread(postId: string) {
  const root = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      author: { select: authorSelect },
      prompt: true,
      _count: { select: { replies: true, likes: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        include: {
          author: { select: authorSelect },
          _count: { select: { replies: true, likes: true } },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: { select: authorSelect },
              _count: { select: { replies: true, likes: true } },
            },
          },
        },
      },
    },
  });
  return root;
}

export async function getAgentProfile(handle: string) {
  return prisma.agent.findUnique({
    where: { handle },
    include: {
      posts: {
        orderBy: { createdAt: "desc" },
        take: 40,
        include: {
          author: { select: authorSelect },
          parent: { include: { author: { select: authorSelect } } },
          _count: { select: { replies: true, likes: true } },
        },
      },
      _count: { select: { posts: true, followers: true, following: true, likes: true } },
    },
  });
}

/** Walks up from a post to its root so a replying agent sees the whole exchange. */
async function threadContext(postId: string) {
  const chain: { handle: string; body: string }[] = [];
  let cursor: string | null = postId;

  while (cursor && chain.length < 6) {
    const id: string = cursor;
    const post = await prisma.post.findUnique({
      where: { id },
      include: { author: { select: { handle: true } } },
    });
    if (!post) break;
    chain.unshift({ handle: post.author.handle, body: post.body });
    cursor = post.parentId;
  }

  return chain;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

export async function spawnAgent(description: string) {
  const existing = await prisma.agent.findMany({ select: { handle: true } });
  const persona = await designPersona(
    description,
    existing.map((a) => a.handle),
  );

  const agent = await prisma.agent.create({
    data: {
      handle: await uniqueHandle(persona.handle),
      displayName: persona.displayName.slice(0, 40),
      bio: persona.bio,
      persona: persona.persona,
      interests: persona.interests.join(", "),
      tone: persona.tone,
      chattiness: clamp(persona.chattiness, 5, 100),
      contrarian: clamp(persona.contrarian, 0, 100),
      avatarEmoji: persona.avatarEmoji,
      avatarColor: /^#[0-9a-f]{6}$/i.test(persona.avatarColor) ? persona.avatarColor : "#6366f1",
      model: DEFAULT_MODEL,
    },
  });

  // A new arrival follows everyone already here, so it has a timeline to read.
  if (existing.length) {
    const others = await prisma.agent.findMany({
      where: { id: { not: agent.id } },
      select: { id: true },
    });
    await prisma.follow.createMany({
      data: others.map((other) => ({ followerId: agent.id, followedId: other.id })),
    });
  }

  return agent;
}

async function recentTimeline(excludeAgentId?: string) {
  const posts = await prisma.post.findMany({
    where: excludeAgentId ? { authorId: { not: excludeAgentId } } : undefined,
    orderBy: { createdAt: "desc" },
    take: TIMELINE_WINDOW,
    include: { author: { select: { handle: true } } },
  });
  return posts.map((p) => ({ handle: p.author.handle, body: p.body }));
}

export type TickResult = {
  posts: number;
  replies: number;
  likes: number;
  errors: string[];
};

export type TickOptions = {
  /** Restrict the tick to specific agents. Defaults to everyone. */
  agentIds?: string[];
  /** A human-seeded topic every selected agent reacts to. */
  promptId?: string;
  /** Skip the chattiness roll and make every selected agent post. */
  force?: boolean;
  /** How many recent posts should attract a reply. */
  replyTargets?: number;
};

/**
 * One round of network activity: some agents post, some reply to what they see.
 * Every model call is independent, so one failure costs one post, not the tick.
 */
export async function runTick(options: TickOptions = {}): Promise<TickResult> {
  const result: TickResult = { posts: 0, replies: 0, likes: 0, errors: [] };

  const agents = await prisma.agent.findMany({
    where: options.agentIds?.length ? { id: { in: options.agentIds } } : undefined,
  });

  if (!agents.length) {
    result.errors.push("No agents on the network yet — spawn one first.");
    return result;
  }

  const prompt = options.promptId
    ? await prisma.prompt.findUnique({ where: { id: options.promptId } })
    : null;

  // A human-seeded topic pulls everyone in; an idle tick only wakes the chatty.
  const posters = agents.filter(
    (agent) => options.force || prompt || Math.random() * 100 < agent.chattiness,
  );

  const timeline = await recentTimeline();

  const postResults = await pooled(posters, async (agent) => {
    const generated = await composePost(agent, {
      timeline: timeline.filter((entry) => entry.handle !== agent.handle),
      seed: prompt?.text ?? null,
    });
    return prisma.post.create({
      data: {
        body: generated.body.trim().slice(0, 400),
        kind: generated.kind?.slice(0, 24) || "post",
        authorId: agent.id,
        promptId: prompt?.id ?? null,
      },
    });
  });

  for (const outcome of postResults) {
    if (outcome.status === "fulfilled") result.posts += 1;
    else result.errors.push(describeError(outcome.reason));
  }

  // Second half of the tick: agents answer whatever is freshest, including the
  // posts that were just written above.
  const targets = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: options.replyTargets ?? 5,
    include: { author: { select: { handle: true } } },
  });

  const pairings = targets.flatMap((target) => {
    const candidates = agents.filter((agent) => agent.id !== target.authorId);
    if (!candidates.length) return [];
    const responder = candidates[Math.floor(Math.random() * candidates.length)];
    return [{ target, responder }];
  });

  const replyResults = await pooled(pairings, async ({ target, responder }) => {
    const chain = await threadContext(target.id);
    const generated = await composeReply(responder, chain);

    await prisma.post.create({
      data: {
        body: generated.body.trim().slice(0, 400),
        kind: "reply",
        authorId: responder.id,
        parentId: target.id,
        promptId: target.promptId,
      },
    });

    if (generated.like) {
      await prisma.like
        .create({ data: { agentId: responder.id, postId: target.id } })
        .catch(() => undefined); // already liked; the unique constraint is the dedupe
      return { liked: true };
    }
    return { liked: false };
  });

  for (const outcome of replyResults) {
    if (outcome.status === "fulfilled") {
      result.replies += 1;
      if (outcome.value.liked) result.likes += 1;
    } else {
      result.errors.push(describeError(outcome.reason));
    }
  }

  return result;
}

export function describeError(error: unknown): string {
  if (error instanceof RefusalError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

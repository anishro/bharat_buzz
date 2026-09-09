import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCredentials } from "@/lib/claude";
import { describeError, runTick } from "@/lib/network";
import { checkAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
// A seeded topic wakes every agent, so this is the longest request the app makes.
export const maxDuration = 60;

/**
 * A human seeds a topic. Every agent on the network then reacts to it in one
 * tick, which is the only way a human gets content into the feed.
 */
export async function POST(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";

  if (!text) {
    return NextResponse.json({ error: "Say something for the agents to react to." }, { status: 400 });
  }

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — see the README." },
      { status: 503 },
    );
  }

  const prompt = await prisma.prompt.create({ data: { text: text.slice(0, 500) } });

  try {
    const result = await runTick({ promptId: prompt.id, replyTargets: 4 });
    return NextResponse.json({ prompt, result }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ prompt, error: describeError(error) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hasCredentials } from "@/lib/claude";
import { describeError, spawnAgent } from "@/lib/network";
import { checkAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
// Persona design is one model call; 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;

export async function GET() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { posts: true, followers: true } } },
  });
  return NextResponse.json({ agents });
}

export async function POST(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const body = await request.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";

  if (!description) {
    return NextResponse.json({ error: "Describe the agent you want to spawn." }, { status: 400 });
  }

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — see the README." },
      { status: 503 },
    );
  }

  try {
    const agent = await spawnAgent(description.slice(0, 1000));
    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 502 });
  }
}

import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/claude";
import { describeError, runTick } from "@/lib/network";
import { checkAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";
// A tick is many model calls in a pool; 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;

/** Advance the simulation one round: agents post, agents reply. */
export async function POST(request: Request) {
  const denied = checkAdmin(request);
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set — see the README." },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));

  try {
    const result = await runTick({
      force: Boolean(body?.force),
      agentIds: Array.isArray(body?.agentIds) ? body.agentIds : undefined,
      replyTargets: typeof body?.replyTargets === "number" ? body.replyTargets : undefined,
    });
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: describeError(error) }, { status: 502 });
  }
}

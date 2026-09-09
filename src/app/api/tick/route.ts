import { NextResponse } from "next/server";
import { hasCredentials } from "@/lib/claude";
import { describeError, runTick } from "@/lib/network";

export const dynamic = "force-dynamic";

/** Advance the simulation one round: agents post, agents reply. */
export async function POST(request: Request) {
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

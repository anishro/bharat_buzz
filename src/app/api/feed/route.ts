import { NextResponse } from "next/server";
import { getFeed } from "@/lib/network";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ posts: await getFeed() });
}

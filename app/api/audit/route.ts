import { NextResponse } from "next/server";
import { readGenerationAudits } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const requested = Number(new URL(request.url).searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(requested) ? requested : 50;
  return NextResponse.json({ entries: await readGenerationAudits(limit) });
}

import { NextResponse } from "next/server";
import { createResearchJob, jobInputSchema, listResearchJobs } from "@/lib/assistant";
export const runtime = "nodejs";
export async function GET(request: Request) { return NextResponse.json({ jobs: listResearchJobs(new URL(request.url).searchParams.get("conversationId") ?? undefined) }); }
export async function POST(request: Request) { const parsed = jobInputSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 }); return NextResponse.json(createResearchJob(parsed.data), { status: 201 }); }

import { NextResponse } from "next/server";
import { addCandidate, candidateInputSchema, listCandidates } from "@/lib/assistant";
export const runtime = "nodejs";
export async function GET(request: Request) { const jobId = new URL(request.url).searchParams.get("jobId"); return jobId ? NextResponse.json({ candidates: listCandidates(jobId) }) : NextResponse.json({ error: "jobId is required" }, { status: 400 }); }
export async function POST(request: Request) { const parsed = candidateInputSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 }); try { return NextResponse.json(addCandidate(parsed.data), { status: 201 }); } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid candidate" }, { status: 400 }); } }

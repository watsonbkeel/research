import { NextResponse } from "next/server";
import { getResearchJob, listArtifacts, listCandidates } from "@/lib/assistant";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) { const { jobId } = await context.params; const job = getResearchJob(jobId); if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 }); return NextResponse.json({ job, artifacts: listArtifacts(jobId), candidates: listCandidates(jobId) }); }

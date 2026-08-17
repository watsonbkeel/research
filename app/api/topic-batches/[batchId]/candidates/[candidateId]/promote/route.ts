import { NextResponse } from "next/server";
import { ensureProjectProposal } from "@/lib/project-documents";
import { promoteTopicCandidate } from "@/lib/portfolio";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ batchId: string; candidateId: string }> }) { const { candidateId } = await context.params; try { const overrides = await request.json().catch(() => ({})); const project = promoteTopicCandidate(candidateId, overrides); const proposal = ensureProjectProposal(project.id); return NextResponse.json({ project, proposal }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "候选立项失败。" }, { status: 400 }); } }

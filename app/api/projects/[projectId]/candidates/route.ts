import { NextResponse } from "next/server";
import { listCandidateRecords, listVerificationEvents } from "@/lib/evidence-store";
import { verifyCandidateBibliography } from "@/lib/bibliographic-verification";
import { getProject } from "@/lib/portfolio";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) { const { projectId } = await context.params; if (!getProject(projectId)) return NextResponse.json({ error: "项目不存在。" }, { status: 404 }); return NextResponse.json({ candidates: listCandidateRecords(projectId), verificationEvents: listVerificationEvents({ projectId }) }); }
export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) { const { projectId } = await context.params; if (!getProject(projectId)) return NextResponse.json({ error: "项目不存在。" }, { status: 404 }); const body = await request.json().catch(() => ({})); try { const result = await verifyCandidateBibliography({ projectId, candidateId: String(body.candidateId) }); return NextResponse.json(result, { status: result.event.result === "verified" ? 200 : 409 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "核验失败" }, { status: 400 }); } }

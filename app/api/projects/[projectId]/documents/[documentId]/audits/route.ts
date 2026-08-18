import { NextResponse } from "next/server";
import { getProjectDocument } from "@/lib/project-documents";
import { runCitationAudit, latestAudit } from "@/lib/citation-audit";
import { runConsistencyReview, latestConsistencyReview } from "@/lib/consistency-review";
import { updateConsistencyHumanApproval } from "@/lib/evidence-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; documentId: string }> };
export async function GET(_request: Request, context: Context) { const { projectId, documentId } = await context.params; if (!getProjectDocument(projectId, documentId)) return NextResponse.json({ error: "文档不存在。" }, { status: 404 }); return NextResponse.json({ citationAudit: latestAudit(projectId, documentId), consistencyReview: latestConsistencyReview(projectId, documentId) }); }
export async function POST(request: Request, context: Context) { const { projectId, documentId } = await context.params; if (!getProjectDocument(projectId, documentId)) return NextResponse.json({ error: "文档不存在。" }, { status: 404 }); const body = await request.json().catch(() => ({})); if (body.type === "citation") return NextResponse.json(await runCitationAudit({ projectId, documentId, formal: body.formal === true })); if (body.type === "consistency") return NextResponse.json(await runConsistencyReview({ projectId, documentId })); if (body.type === "consistency-approval" && ["not_reviewed", "approved", "changes_requested"].includes(body.humanApproval)) return NextResponse.json(updateConsistencyHumanApproval(projectId, documentId, body.humanApproval)); return NextResponse.json({ error: "审查类型无效。" }, { status: 400 }); }

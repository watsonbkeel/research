import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { readInstitutionProfile } from "@/lib/institution";
import { readResearchPlan } from "@/lib/research-plan";
import { readWorkspace } from "@/lib/storage";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument } from "@/lib/project-documents";
import { runCitationAudit } from "@/lib/citation-audit";
import { safeFileSlug } from "@/lib/project-document-exporter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId");
  const documentId = params.get("documentId");
  const versionId = params.get("versionId") ?? undefined;
  const formal = params.get("formal") === "1";
  if (!projectId || !documentId) return new Response(JSON.stringify({ error: "projectId、documentId 是必填参数。" }), { status: 400, headers: { "content-type": "application/json" } });
  const project = getProject(projectId); const document = project ? getProjectDocument(projectId, documentId) : undefined;
  if (!project || !document) return new Response(JSON.stringify({ error: "项目或 Confirmation Proposal 不存在。" }), { status: 404, headers: { "content-type": "application/json" } });
  const audit = await runCitationAudit({ projectId, documentId: document.id, versionId, formal });
  if (formal && audit.blockers.length) return new Response(JSON.stringify({ error: "正式 Proposal 导出被引用审查阻断。", audit }), { status: 409, headers: { "content-type": "application/json" } });
  const [workspace, researchPlan, institution, evidence] = await Promise.all([readWorkspace(projectId), readResearchPlan(projectId), Promise.resolve(readInstitutionProfile(projectId)), listEvidenceExcerpts({ projectId })]);
  const body = await exportConfirmationProposal({ workspace, manuscript: document.manuscript, researchPlan, institution, evidence });
  return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${safeFileSlug(project.titleEn)}-confirmation-proposal.docx"`, "cache-control": "no-store" } });
}

import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { readInstitutionProfile } from "@/lib/institution";
import { readResearchPlan } from "@/lib/research-plan";
import { readWorkspace } from "@/lib/storage";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument, documentForVersion, formalExportSnapshot } from "@/lib/project-documents";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
import { safeFileSlug } from "@/lib/project-document-exporter";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId");
  const documentId = params.get("documentId");
  const versionId = params.get("versionId") ?? undefined;
  const formal = params.get("formal") === "1";
  if (!projectId || !documentId) return new Response(JSON.stringify({ error: "projectId、documentId 是必填参数。" }), { status: 400, headers: { "content-type": "application/json" } });
  if (formal && !versionId) return new Response(JSON.stringify({ error: "正式导出必须指定 versionId。" }), { status: 400, headers: { "content-type": "application/json" } });
  const project = getProject(projectId); const document = project ? getProjectDocument(projectId, documentId) : undefined;
  if (!project || !document) return new Response(JSON.stringify({ error: "项目或 Confirmation Proposal 不存在。" }), { status: 404, headers: { "content-type": "application/json" } });
  const gate = formal ? await checkFormalExportGate({ projectId, documentId: document.id, versionId }) : undefined;
  if (gate && !gate.allowed) return new Response(JSON.stringify({ error: "正式 Proposal 导出被统一质量门阻断。", gate }), { status: 409, headers: { "content-type": "application/json" } });
  const exportDocument = versionId ? documentForVersion(document, versionId) : document; if (!exportDocument) return new Response(JSON.stringify({ error: "指定版本不存在。" }), { status: 404, headers: { "content-type": "application/json" } });
  const frozen = formal && versionId ? formalExportSnapshot(projectId, document.id, versionId) : undefined;
  const [workspace, researchPlan, institution, evidence] = frozen ? [frozen.workspace, frozen.researchPlan, frozen.institution, frozen.evidence] : await Promise.all([readWorkspace(projectId), readResearchPlan(projectId), Promise.resolve(readInstitutionProfile(projectId)), listEvidenceExcerpts({ projectId })]);
  const body = await exportConfirmationProposal({ workspace, manuscript: exportDocument.manuscript, researchPlan, institution, evidence });
  return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${safeFileSlug(project.titleEn)}-confirmation-proposal.docx"`, "cache-control": "no-store" } });
}

import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument, documentForVersion, formalExportSnapshot } from "@/lib/project-documents";
import { exportProjectDocumentDocx, safeFileSlug } from "@/lib/project-document-exporter";
import { readWorkspace } from "@/lib/storage";
import { runCitationAudit } from "@/lib/citation-audit";
import { checkFormalExportGate } from "@/lib/formal-export-gate";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const projectId = params.get("projectId");
  const documentId = params.get("documentId");
  const versionId = params.get("versionId") ?? undefined;
  const formal = params.get("formal") === "1";
  if (!projectId || !documentId) return NextResponse.json({ error: "projectId、documentId 是必填参数。" }, { status: 400 });
  const project = getProject(projectId);
  const document = getProjectDocument(projectId, documentId);
  if (!project || !document) return NextResponse.json({ error: "项目或文档不存在。" }, { status: 404 });
  const gate = formal ? await checkFormalExportGate({ projectId, documentId, versionId }) : undefined;
  if (gate && !gate.allowed) return NextResponse.json({ error: "正式导出质量门阻断。", gate }, { status: 409 });
  const exportDocument = versionId ? documentForVersion(document, versionId) : document; if (!exportDocument) return NextResponse.json({ error: "指定版本不存在。" }, { status: 404 });
  const audit = formal ? undefined : await runCitationAudit({ projectId, documentId, versionId, formal: false, documentOverride: exportDocument });
  const body = await exportProjectDocumentDocx(project, exportDocument, formal && versionId ? formalExportSnapshot(projectId, documentId, versionId).workspace : await readWorkspace(projectId), audit);
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": `attachment; filename="${safeFileSlug(exportDocument.title)}.docx"`,
      "cache-control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument } from "@/lib/project-documents";
import { exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
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
  const audit = formal ? undefined : await runCitationAudit({ projectId, documentId, versionId, formal: false });
  const body = exportProjectDocumentMarkdown(project, document, await readWorkspace(projectId), audit);
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": `attachment; filename="${safeFileSlug(document.title)}.md"`,
    },
  });
}

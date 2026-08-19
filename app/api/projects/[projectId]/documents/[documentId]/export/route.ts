import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument, documentForVersion } from "@/lib/project-documents";
import { exportProjectDocumentDocx, exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
import { readWorkspace } from "@/lib/storage";
import { runCitationAudit } from "@/lib/citation-audit";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await context.params; const project = getProject(projectId), document = getProjectDocument(projectId, documentId);
  if (!project || !document) return NextResponse.json({ error: "项目或文档不存在。" }, { status: 404 });
  const params = new URL(request.url).searchParams; const format = params.get("format") ?? "docx"; const formal = params.get("formal") === "1"; const versionId = params.get("versionId") ?? undefined; const slug = safeFileSlug(document.title); const workspace = await readWorkspace(projectId);
  if (formal && !versionId) return NextResponse.json({ error: "正式导出必须指定 versionId。" }, { status: 400 });
  const gate = formal ? await checkFormalExportGate({ projectId, documentId, versionId }) : undefined;
  if (gate && !gate.allowed) return NextResponse.json({ error: "正式导出质量门阻断。", gate }, { status: 409 });
  const exportDocument = versionId ? documentForVersion(document, versionId) : document; if (!exportDocument) return NextResponse.json({ error: "指定版本不存在。" }, { status: 404 });
  const draftAudit = formal ? undefined : await runCitationAudit({ projectId, documentId, versionId, formal: false, documentOverride: exportDocument });
  if (format === "markdown") return new Response(exportProjectDocumentMarkdown(project, exportDocument, workspace, draftAudit), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${slug}.md"` } });
  if (format === "docx") { const body = await exportProjectDocumentDocx(project, exportDocument, workspace, draftAudit); return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${slug}.docx"`, "cache-control": "no-store" } }); }
  return NextResponse.json({ error: "不支持的导出格式。" }, { status: 400 });
}

import { NextResponse } from "next/server";
import { exportBibtex } from "@/lib/exporters";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument, documentForVersion } from "@/lib/project-documents";
import { exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
import { runCitationAudit } from "@/lib/citation-audit";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const format = params.get("format") ?? "markdown";
  const projectId = params.get("projectId");
  const documentId = params.get("documentId");
  const versionId = params.get("versionId") ?? undefined;
  const formal = params.get("formal") === "1";
  if (!projectId || !documentId) return NextResponse.json({ error: "projectId、documentId 是必填参数。" }, { status: 400 });
  if (formal && !versionId) return NextResponse.json({ error: "正式导出必须指定 versionId。" }, { status: 400 });
  const project = getProject(projectId);
  const document = getProjectDocument(projectId, documentId);
  if (!project || !document) return NextResponse.json({ error: "项目或文档不存在。" }, { status: 404 });
  const gate = formal ? await checkFormalExportGate({ projectId, documentId, versionId }) : undefined;
  if (gate && !gate.allowed) return NextResponse.json({ error: "正式导出被统一质量门阻断。", gate }, { status: 409 });
  const exportDocument = versionId ? documentForVersion(document, versionId) : document; if (!exportDocument) return NextResponse.json({ error: "指定版本不存在。" }, { status: 404 });
  const audit = formal ? undefined : await runCitationAudit({ projectId, documentId, versionId, formal: false, documentOverride: exportDocument });
  const workspace = await readWorkspace(projectId);
  const citedWorkIds = [...new Set(exportDocument.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  if (format === "markdown") {
    return new NextResponse(exportProjectDocumentMarkdown(project, exportDocument, workspace, formal ? undefined : audit), {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${safeFileSlug(exportDocument.title)}.md"` },
    });
  }
  if (format === "bibtex") {
    return new NextResponse(exportBibtex(workspace, citedWorkIds), {
      headers: { "content-type": "application/x-bibtex; charset=utf-8", "content-disposition": `attachment; filename="${safeFileSlug(`${project.titleEn}-references`)}.bib"` },
    });
  }
  return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
}

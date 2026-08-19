import { NextResponse } from "next/server";
import { exportBibtex } from "@/lib/exporters";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument } from "@/lib/project-documents";
import { readWorkspace } from "@/lib/storage";
import { runCitationAudit } from "@/lib/citation-audit";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
import { safeFileSlug } from "@/lib/project-document-exporter";

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
  if (!formal) await runCitationAudit({ projectId, documentId, versionId, formal: false });
  const citedWorkIds = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const body = exportBibtex(await readWorkspace(projectId), citedWorkIds);
  return new Response(body, {
    headers: {
      "content-type": "application/x-bibtex; charset=utf-8",
      "content-disposition": `attachment; filename="${safeFileSlug(`${project.titleEn}-references`)}.bib"`,
    },
  });
}

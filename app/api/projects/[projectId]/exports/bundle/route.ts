import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { listProjectDocuments } from "@/lib/project-documents";
import { exportProjectDocumentDocx, exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
import { readWorkspace } from "@/lib/storage";
import { exportBibtex } from "@/lib/exporters";
import { buildQualityReport } from "@/lib/quality";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params; const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const [workspace, quality] = await Promise.all([readWorkspace(projectId), buildQualityReport(projectId)]); const documents = listProjectDocuments(projectId); const zip = new JSZip();
  for (const document of documents) { const slug = safeFileSlug(document.title); zip.file(`documents/${slug}.md`, exportProjectDocumentMarkdown(project, document)); zip.file(`documents/${slug}.docx`, await exportProjectDocumentDocx(project, document)); }
  zip.file("references.bib", exportBibtex(workspace)); zip.file("quality-report.json", JSON.stringify(quality, null, 2)); zip.file("manifest.json", JSON.stringify({ projectId, title: project.titleEn, generatedAt: new Date().toISOString(), documents: documents.map((document) => ({ id: document.id, type: document.documentType, mode: document.mode, title: document.title, prospective: document.mode === "prospective" })) }, null, 2));
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }); return new Response(Uint8Array.from(body).buffer, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${safeFileSlug(project.titleEn)}-portfolio.zip"`, "cache-control": "no-store" } });
}

import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { listProjectDocuments } from "@/lib/project-documents";
import { exportProjectDocumentDocx, exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
import { readWorkspace } from "@/lib/storage";
import { exportBibtex } from "@/lib/exporters";
import { buildQualityReport } from "@/lib/quality";
import { runCitationAudit } from "@/lib/citation-audit";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params; const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const formal = new URL(request.url).searchParams.get("formal") === "1";
  const [workspace, quality] = await Promise.all([readWorkspace(projectId), buildQualityReport(projectId)]); const documents = listProjectDocuments(projectId); const audits = await Promise.all(documents.map((document) => runCitationAudit({ projectId, documentId: document.id, formal })));
  const blockers = audits.flatMap((audit) => audit.blockers); const warnings = audits.flatMap((audit) => audit.warnings);
  if (formal && blockers.length) return NextResponse.json({ error: "正式项目导出被引用审查阻断。", blockers, warnings, audits }, { status: 409 });
  const zip = new JSZip();
  for (const document of documents) { const slug = safeFileSlug(document.title); const audit = formal ? undefined : audits.find((item) => item.documentId === document.id); zip.file(`documents/${slug}.md`, exportProjectDocumentMarkdown(project, document, workspace, audit)); zip.file(`documents/${slug}.docx`, await exportProjectDocumentDocx(project, document, workspace, audit)); }
  const citedWorkIds = [...new Set(documents.flatMap((document) => document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds))))];
  zip.file("references.bib", exportBibtex(workspace, citedWorkIds)); zip.file("quality-report.json", JSON.stringify(quality, null, 2)); zip.file("citation-audits.json", JSON.stringify(audits, null, 2)); zip.file("AUDIT-STATUS.md", `# ${formal ? "Formal" : "Draft"} export status\n\n- Citation audit blockers: ${blockers.length}\n- Citation audit warnings: ${warnings.length}\n- Formal approval: ${formal && blockers.length === 0 ? "not established by automatic audit; supervisor approval remains required" : "not requested"}\n\n${blockers.concat(warnings).map((issue) => `- ${issue.severity.toUpperCase()}: ${issue.message}`).join("\n") || "No citation audit issues were recorded."}\n`); zip.file("manifest.json", JSON.stringify({ projectId, title: project.titleEn, generatedAt: new Date().toISOString(), exportMode: formal ? "formal" : "draft", citationAudit: { blockers: blockers.length, warnings: warnings.length }, documents: documents.map((document) => ({ id: document.id, type: document.documentType, mode: document.mode, title: document.title, prospective: document.mode === "prospective" })) }, null, 2));
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }); return new Response(Uint8Array.from(body).buffer, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${safeFileSlug(project.titleEn)}-portfolio.zip"`, "cache-control": "no-store" } });
}

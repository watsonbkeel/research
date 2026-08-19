import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { documentForVersion, listProjectDocuments } from "@/lib/project-documents";
import { exportProjectDocumentDocx, exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
import { readWorkspace } from "@/lib/storage";
import { exportBibtex } from "@/lib/exporters";
import { buildQualityReport } from "@/lib/quality";
import { runCitationAudit } from "@/lib/citation-audit";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params; const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const params = new URL(request.url).searchParams; const formal = params.get("formal") === "1"; const requestedVersionIds = params.getAll("versionId");
  const [workspace, quality] = await Promise.all([readWorkspace(projectId), buildQualityReport(projectId)]); const documents = listProjectDocuments(projectId);
  if (formal && requestedVersionIds.length !== documents.length) return NextResponse.json({ error: "正式 ZIP 导出必须为每份文档指定 versionId。" }, { status: 400 });
  const gates = formal ? await Promise.all(documents.map((document, index) => checkFormalExportGate({ projectId, documentId: document.id, versionId: requestedVersionIds[index] }))) : [];
  const exportDocuments = formal ? documents.map((document, index) => documentForVersion(document, requestedVersionIds[index])).filter((document): document is NonNullable<typeof document> => Boolean(document)) : documents;
  if (formal && exportDocuments.length !== documents.length) return NextResponse.json({ error: "正式 ZIP 导出包含不存在的 versionId。" }, { status: 404 });
  const audits = formal ? gates.map((gate, index) => ({ id: `gate-${documents[index].id}`, projectId, documentId: documents[index].id, versionId: requestedVersionIds[index], status: gate.allowed ? "passed" as const : "blocked" as const, blockers: gate.blockers.map((item) => ({ code: item.code, severity: "blocker" as const, message: item.message })), warnings: gate.warnings.map((item) => ({ code: item.code, severity: "warning" as const, message: item.message })), checkedAt: new Date().toISOString(), checkerVersion: "formal-export-gate" })) : await Promise.all(documents.map((document) => runCitationAudit({ projectId, documentId: document.id, formal: false })));
  const blockers = audits.flatMap((audit) => audit.blockers); const warnings = audits.flatMap((audit) => audit.warnings);
  if (formal && gates.some((gate) => !gate.allowed)) return NextResponse.json({ error: "正式项目导出被统一质量门阻断。", blockers, warnings, gates }, { status: 409 });
  const zip = new JSZip();
  for (const document of exportDocuments) { const slug = safeFileSlug(document.title); const audit = formal ? undefined : audits.find((item) => item.documentId === document.id); zip.file(`documents/${slug}.md`, exportProjectDocumentMarkdown(project, document, workspace, audit)); zip.file(`documents/${slug}.docx`, await exportProjectDocumentDocx(project, document, workspace, audit)); }
  const citedWorkIds = [...new Set(exportDocuments.flatMap((document) => document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds))))];
  zip.file("references.bib", exportBibtex(workspace, citedWorkIds)); zip.file("quality-report.json", JSON.stringify(quality, null, 2)); zip.file("citation-audits.json", JSON.stringify(audits, null, 2)); zip.file("AUDIT-STATUS.md", `# ${formal ? "Formal" : "Draft"} export status\n\n- Citation audit blockers: ${blockers.length}\n- Citation audit warnings: ${warnings.length}\n- Formal approval: ${formal && blockers.length === 0 ? "not established by automatic audit; supervisor approval remains required" : "not requested"}\n\n${blockers.concat(warnings).map((issue) => `- ${issue.severity.toUpperCase()}: ${issue.message}`).join("\n") || "No citation audit issues were recorded."}\n`); zip.file("manifest.json", JSON.stringify({ projectId, title: project.titleEn, generatedAt: new Date().toISOString(), exportMode: formal ? "formal" : "draft", citationAudit: { blockers: blockers.length, warnings: warnings.length }, documents: documents.map((document) => ({ id: document.id, type: document.documentType, mode: document.mode, title: document.title, prospective: document.mode === "prospective" })) }, null, 2));
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" }); return new Response(Uint8Array.from(body).buffer, { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${safeFileSlug(project.titleEn)}-portfolio.zip"`, "cache-control": "no-store" } });
}

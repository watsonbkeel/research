import { NextResponse } from "next/server";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument } from "@/lib/project-documents";
import { exportProjectDocumentDocx, exportProjectDocumentMarkdown, safeFileSlug } from "@/lib/project-document-exporter";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await context.params; const project = getProject(projectId), document = getProjectDocument(projectId, documentId);
  if (!project || !document) return NextResponse.json({ error: "项目或文档不存在。" }, { status: 404 });
  const format = new URL(request.url).searchParams.get("format") ?? "docx"; const slug = safeFileSlug(document.title);
  if (format === "markdown") return new Response(exportProjectDocumentMarkdown(project, document), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${slug}.md"` } });
  if (format === "docx") { const body = await exportProjectDocumentDocx(project, document); return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": `attachment; filename="${slug}.docx"`, "cache-control": "no-store" } }); }
  return NextResponse.json({ error: "不支持的导出格式。" }, { status: 400 });
}

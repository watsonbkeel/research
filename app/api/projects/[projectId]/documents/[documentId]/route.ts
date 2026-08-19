import { NextResponse } from "next/server";
import { getProjectDocument, saveProjectDocument, saveProjectSection, setProjectDocumentMode, setProjectDocumentEvidenceMode } from "@/lib/project-documents";
import { manuscriptSchema } from "@/lib/manuscript";
import { compileClaimCoverage } from "@/lib/claim-coverage";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; documentId: string }> };

export async function GET(_request: Request, context: Context) {
  const { projectId, documentId } = await context.params;
  const document = getProjectDocument(projectId, documentId);
  return document ? NextResponse.json({ document }) : NextResponse.json({ error: "文档不存在。" }, { status: 404 });
}

export async function PUT(request: Request, context: Context) {
  const { projectId, documentId } = await context.params;
  const body = await request.json().catch(() => ({}));
  try {
    if (typeof body.sectionId === "string") {
      const current = getProjectDocument(projectId, documentId);
      if (!current) return NextResponse.json({ error: "文档不存在。" }, { status: 404 });
      const candidate = structuredClone(current); const candidateSection = candidate.manuscript.chapters.flatMap((chapter) => chapter.sections).find((section) => section.id === body.sectionId);
      if (!candidateSection) return NextResponse.json({ error: "章节不存在。" }, { status: 404 });
      candidateSection.content = String(body.content ?? "");
      if (current.evidenceMode === "formal") {
        const coverage = await compileClaimCoverage({ projectId, documentId, documentOverride: candidate, persist: false });
        if (coverage.blockers.length) return NextResponse.json({ error: "正式文档保存被 Claim Coverage 阻断。", coverage }, { status: 409 });
      }
      return NextResponse.json(saveProjectSection({ projectId, documentId, sectionId: body.sectionId, content: String(body.content ?? ""), changeSummary: String(body.changeSummary ?? "Researcher saved section draft"), editor: String(body.editor ?? "researcher"), generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : undefined, expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined }));
    }
    const parsed = manuscriptSchema.parse(body.manuscript ?? body);
    return NextResponse.json({ document: saveProjectDocument(projectId, documentId, parsed, { expectedVersion: typeof body.expectedVersion === "number" ? body.expectedVersion : undefined, editor: String(body.editor ?? "researcher") }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "文档保存失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const { projectId, documentId } = await context.params; const body = await request.json().catch(() => ({}));
  if (body.evidenceMode === "exploratory" || body.evidenceMode === "formal") { try { return NextResponse.json({ document: setProjectDocumentEvidenceMode(projectId, documentId, body.evidenceMode) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "证据模式更新失败。" }, { status: 409 }); } }
  if (!["prospective", "empirical", "theoretical", "review"].includes(body.researchMode ?? body.mode)) return NextResponse.json({ error: "研究模式无效。" }, { status: 400 });
  try { return NextResponse.json({ document: setProjectDocumentMode(projectId, documentId, body.researchMode ?? body.mode) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文档模式更新失败。" }, { status: 409 }); }
}

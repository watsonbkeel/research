import { NextResponse } from "next/server";
import { getProjectDocument, saveProjectDocument, saveProjectSection, setProjectDocumentMode } from "@/lib/project-documents";
import { manuscriptSchema } from "@/lib/manuscript";

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
      return NextResponse.json(saveProjectSection({ projectId, documentId, sectionId: body.sectionId, content: String(body.content ?? ""), changeSummary: String(body.changeSummary ?? "Researcher saved section draft"), editor: String(body.editor ?? "researcher"), generatedBy: typeof body.generatedBy === "string" ? body.generatedBy : undefined }));
    }
    const parsed = manuscriptSchema.parse(body.manuscript ?? body);
    return NextResponse.json({ document: saveProjectDocument(projectId, documentId, parsed) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "文档保存失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: Context) {
  const { projectId, documentId } = await context.params; const body = await request.json().catch(() => ({}));
  if (body.mode !== "prospective" && body.mode !== "empirical") return NextResponse.json({ error: "文档模式无效。" }, { status: 400 });
  try { return NextResponse.json({ document: setProjectDocumentMode(projectId, documentId, body.mode) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文档模式更新失败。" }, { status: 409 }); }
}

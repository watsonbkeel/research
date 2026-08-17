import { NextResponse } from "next/server";
import { createJournalArticle, ensureProjectProposal, listProjectDocuments } from "@/lib/project-documents";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params;
  try { ensureProjectProposal(projectId); return NextResponse.json({ documents: listProjectDocuments(projectId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "文档加载失败。" }, { status: 404 }); }
}

export async function POST(request: Request, context: Context) {
  const { projectId } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (typeof body.title !== "string" || body.title.trim().length < 3) return NextResponse.json({ error: "论文标题至少需要3个字符。" }, { status: 400 });
  try { return NextResponse.json({ document: createJournalArticle(projectId, { title: body.title.trim(), targetJournal: typeof body.targetJournal === "string" ? body.targetJournal : "" }) }, { status: 201 }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "论文创建失败。" }, { status: 400 }); }
}

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ error: "该 legacy manuscript API 已停用，请使用 project/document API。" }, { status: 410 });
}

export async function PUT() {
  return NextResponse.json({ error: "该 legacy manuscript API 已停用，请使用 project/document API。" }, { status: 410 });
  /*
  const body = await request.json().catch(() => ({}));
  const sectionId = typeof body?.sectionId === "string" ? body.sectionId : undefined;
  if (sectionId) {
    try { return NextResponse.json(saveSectionDraft(body)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "章节保存失败。" }, { status: 400 }); }
  }
  const parsed = manuscriptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Manuscript无效。" }, { status: 400 });
  return NextResponse.json(saveManuscript(parsed.data)); */
}

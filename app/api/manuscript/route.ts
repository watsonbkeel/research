import { NextResponse } from "next/server";
import { manuscriptSchema, readManuscript, saveManuscript, saveSectionDraft } from "@/lib/manuscript";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(readManuscript());
}

export async function PUT(request: Request) {
  const body = await request.json().catch(() => ({}));
  const sectionId = typeof body?.sectionId === "string" ? body.sectionId : undefined;
  if (sectionId) {
    try { return NextResponse.json(saveSectionDraft(body)); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "章节保存失败。" }, { status: 400 }); }
  }
  const parsed = manuscriptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Manuscript无效。" }, { status: 400 });
  return NextResponse.json(saveManuscript(parsed.data));
}

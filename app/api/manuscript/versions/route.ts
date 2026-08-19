import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ error: "该 legacy manuscript versions API 已停用，请使用 project/document/versions API。" }, { status: 410 });
  /*
  const sectionId = new URL(request.url).searchParams.get("sectionId") ?? undefined;
  return NextResponse.json({ versions: listDraftVersions(sectionId) }); */
}

export async function POST() {
  return NextResponse.json({ error: "该 legacy manuscript versions API 已停用，请使用 project/document/versions API。" }, { status: 410 });
  /*
  const body = await request.json().catch(() => ({}));
  if (typeof body?.versionId !== "string") return NextResponse.json({ error: "缺少versionId。" }, { status: 400 });
  try { return NextResponse.json({ manuscript: restoreDraftVersion(body.versionId) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "版本恢复失败。" }, { status: 400 }); } */
}

import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params;
  try { return NextResponse.json(await readWorkspace(projectId)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "工作区加载失败。" }, { status: 404 }); }
}

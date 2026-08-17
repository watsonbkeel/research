import { NextResponse } from "next/server";
import { getProject, updateProject } from "@/lib/portfolio";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };

export async function GET(_request: Request, context: Context) {
  const { projectId } = await context.params;
  const project = getProject(projectId);
  return project ? NextResponse.json({ project }) : NextResponse.json({ error: "项目不存在。" }, { status: 404 });
}

export async function PATCH(request: Request, context: Context) {
  const { projectId } = await context.params;
  try {
    const body = await request.json();
    return NextResponse.json({ project: updateProject(projectId, body) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目更新失败。" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getProject, projectUpdateSchema, updateProject } from "@/lib/portfolio";
import { snapshotProjectDocumentsAfterCitationStyleChange } from "@/lib/project-documents";

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
    const parsed = projectUpdateSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "项目更新参数无效。" }, { status: 400 });
    const before = getProject(projectId);
    if (!before) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    const project = updateProject(projectId, parsed.data);
    const citationStyleChanged = before.citationStyle !== project.citationStyle;
    const documentVersions = citationStyleChanged
      ? snapshotProjectDocumentsAfterCitationStyleChange(projectId)
      : [];
    return NextResponse.json({ project, citationStyleChanged, documentVersions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目更新失败。" }, { status: 400 });
  }
}

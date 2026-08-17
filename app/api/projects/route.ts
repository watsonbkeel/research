import { NextResponse } from "next/server";
import { createProject, listProjects, projectCreateSchema } from "@/lib/portfolio";
import { ensureProjectProposal } from "@/lib/project-documents";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  return NextResponse.json({ projects: listProjects(includeArchived) });
}

export async function POST(request: Request) {
  const parsed = projectCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "项目资料无效。" }, { status: 400 });
  try {
    const project = createProject(parsed.data);
    const proposal = ensureProjectProposal(project.id);
    return NextResponse.json({ project, proposal }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "项目创建失败。" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument } from "@/lib/project-documents";
import { generateStructuredSection } from "@/lib/generation-service";

export const runtime = "nodejs";

const requestSchema = z.object({
  projectId: z.string().min(1).max(120),
  documentId: z.string().min(1).max(120).optional(),
  sectionId: z.string().min(1).max(120),
  profileId: z.string().max(120).optional(),
  editor: z.string().max(300).default("researcher"),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "请选择要生成的项目章节。" }, { status: 400 });
  try {
    const projectId = parsed.data.projectId;
    if (!getProject(projectId)) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
    const document = parsed.data.documentId ? getProjectDocument(projectId, parsed.data.documentId) : ensureProjectProposal(projectId);
    if (!document) return NextResponse.json({ error: "项目文档不存在。" }, { status: 404 });
    const result = await generateStructuredSection({ projectId, documentId: document.id, sectionId: parsed.data.sectionId, profileId: parsed.data.profileId, editor: parsed.data.editor });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "结构化章节生成失败。" }, { status: 400 });
  }
}

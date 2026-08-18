import { NextResponse } from "next/server";
import { z } from "zod";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument } from "@/lib/project-documents";
import { hasCompletedRealAnalysis } from "@/lib/results";
import { generateStructuredSection } from "@/lib/generation-service";

export const runtime = "nodejs";
const requestSchema = z.object({ sectionId: z.string().min(1).max(160), profileId: z.string().max(120).optional(), editor: z.string().max(300).default("researcher") });

export async function POST(request: Request, context: { params: Promise<{ projectId: string; documentId: string }> }) {
  const { projectId, documentId } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "请选择要生成的章节。" }, { status: 400 });
  const project = getProject(projectId);
  const document = getProjectDocument(projectId, documentId);
  if (!project || !document) return NextResponse.json({ error: "项目或文档不存在。" }, { status: 404 });
  const section = document.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === parsed.data.sectionId);
  if (!section) return NextResponse.json({ error: "章节不存在。" }, { status: 404 });
  const resultsSection = /result|discussion/i.test(section.title);
  if (document.mode === "empirical" && resultsSection && !hasCompletedRealAnalysis(undefined, projectId)) return NextResponse.json({ error: "正式 Results/Discussion 已阻断：当前项目没有完成且标记为真实数据的 AnalysisRun。" }, { status: 409 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const result = await generateStructuredSection({ projectId, documentId, sectionId: section.id, profileId: parsed.data.profileId, editor: parsed.data.editor, signal: controller.signal });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && "category" in error) return NextResponse.json({ error: "章节生成失败。", category: (error as { category?: string }).category }, { status: 502 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "章节生成失败。" }, { status: 400 });
  } finally { clearTimeout(timeout); }
}

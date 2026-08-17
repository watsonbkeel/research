import { NextResponse } from "next/server";
import { z } from "zod";
import { callOpenAICompatible, ProviderCallError } from "@/lib/provider-client";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { getProject } from "@/lib/portfolio";
import { getProjectDocument, saveProjectSection } from "@/lib/project-documents";
import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "@/lib/storage";
import { readResearchPlan } from "@/lib/research-plan";
import { hasCompletedRealAnalysis } from "@/lib/results";

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
  const [settings, workspace, plan, excerpts] = await Promise.all([readPrivateSettings(), readWorkspace(projectId), readResearchPlan(projectId), listEvidenceExcerpts({ projectId })]);
  const evidence = excerpts.filter((item) => item.verificationStatus === "claim_verified" && item.externalModelUsePermission !== "prohibited");
  const requiresEvidence = !/method|ethics|timeline|feasibility|anticipated result|conditional discussion/i.test(section.title);
  if (requiresEvidence && evidence.length === 0) return NextResponse.json({ error: "该章节需要至少一条允许模型使用的 claim-verified EvidenceExcerpt。" }, { status: 409 });
  const prospectiveRules = document.mode === "prospective" && resultsSection
    ? "This is a PROSPECTIVE DRAFT. Write only anticipated directional patterns and conditional interpretation. Do not report a sample, numerical statistic, significance, confidence interval, effect size, completed finding or past-tense empirical claim."
    : "Use future-oriented language for all planned research and never invent empirical results.";
  const prompt = `Write one English section for a ${document.documentType}. Section: ${section.number} ${section.title}. Target words: ${section.targetWords}.\nTitle: ${document.title}. Target venue: ${document.targetVenue || "not selected"}.\n${prospectiveRules}\nProject outcome rule: ${project.policy.outcomeInterpretation}\nForbidden claims: ${project.policy.forbiddenClaims.join("; ")}.\nRegistered studies:\n${workspace.experiments.map((study) => `${study.name}: ${study.design}; ${study.primaryTest}`).join("\n") || "No studies registered."}\nRegistered hypotheses:\n${plan.hypotheses.map((item) => `${item.number}: ${item.englishWording}`).join("\n") || "No hypotheses registered."}\nAllowed evidence excerpts:\n${evidence.map((item) => `[${item.id}] ${item.paraphrase ?? item.quote ?? ""}`).join("\n") || "None; do not make external factual claims."}\nReturn only the requested section. Cite only allowed excerpt IDs in square brackets.`;
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const result = await callOpenAICompatible({ settings, taskType: "english_academic_writing", explicitProfileId: parsed.data.profileId, prompt, systemPrompt: "You are an evidence-bounded academic writer. Never present planned or anticipated outcomes as observed findings.", temperature: 0.2, signal: controller.signal });
    await recordGenerationAttempts("english_academic_writing", result.attempts, { projectId, documentId });
    const content = result.content.trim();
    const allowedIds = new Set(evidence.map((item) => item.id));
    const citedIds = Array.from(content.matchAll(/\[([A-Za-z0-9_-]+)\]/g), (match) => match[1]);
    const unknown = citedIds.filter((id) => !allowedIds.has(id));
    if (unknown.length) return NextResponse.json({ error: `模型使用了项目证据之外的引用：${Array.from(new Set(unknown)).join(", ")}` }, { status: 422 });
    return NextResponse.json(saveProjectSection({ projectId, documentId, sectionId: section.id, content, changeSummary: document.mode === "prospective" ? "Prospective AI draft; no empirical results" : "AI draft; human verification required", editor: parsed.data.editor, generatedBy: `${result.profile.provider}/${result.profile.model}` }));
  } catch (error) {
    if (error instanceof ProviderCallError) { await recordGenerationAttempts("english_academic_writing", error.attempts, { projectId, documentId }); return NextResponse.json({ error: "章节生成失败。", category: error.category }, { status: 502 }); }
    return NextResponse.json({ error: error instanceof Error ? error.message : "章节生成失败。" }, { status: 400 });
  } finally { clearTimeout(timeout); }
}

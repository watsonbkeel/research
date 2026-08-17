import { NextResponse } from "next/server";
import { callOpenAICompatible, ProviderCallError } from "@/lib/provider-client";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { readManuscript, saveSectionDraft } from "@/lib/manuscript";
import { readResearchPlan } from "@/lib/research-plan";
import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "@/lib/storage";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({ sectionId: z.string().min(1).max(120), profileId: z.string().max(120).optional(), editor: z.string().max(300).default("researcher") });

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "请选择要生成的章节。" }, { status: 400 });
  const [workspace, settings, manuscript, researchPlan, allEvidence] = await Promise.all([readWorkspace(), readPrivateSettings(), Promise.resolve(readManuscript()), readResearchPlan(), listEvidenceExcerpts()]);
  const section = manuscript.chapters.flatMap((chapter) => chapter.sections).find((candidate) => candidate.id === parsed.data.sectionId);
  if (!section) return NextResponse.json({ error: "章节不存在。" }, { status: 404 });
  const requiresEvidence = !/methodology|method|ethics|timeline|feasibility/i.test(section.title);
  const evidence = allEvidence.filter((excerpt) => excerpt.verificationStatus === "claim_verified" && excerpt.externalModelUsePermission !== "prohibited");
  if (requiresEvidence && evidence.length === 0) return NextResponse.json({ error: "该章节需要至少一条允许外部模型使用的claim-verified EvidenceExcerpt；当前生成已阻断。" }, { status: 409 });
  const allowedEvidence = evidence.map((excerpt) => `[${excerpt.id}] ${excerpt.workId} (${excerpt.page ?? excerpt.locator ?? "locator pending"}): ${excerpt.paraphrase ?? excerpt.quote ?? ""}`).join("\n");
  const outline = manuscript.chapters.map((chapter) => `${chapter.number}. ${chapter.title}: ${chapter.sections.map((candidate) => candidate.title).join("; ")}`).join("\n");
  const hypotheses = researchPlan.hypotheses.map((hypothesis) => `${hypothesis.number}: ${hypothesis.englishWording} [${hypothesis.evidenceClass}/${hypothesis.priority}]`).join("\n") || "No approved hypotheses are registered yet.";
  const prompt = [
    "You are writing one English section inside a doctoral Confirmation Proposal for an Australian university.",
    "Use this layered workflow internally and preserve its provenance: (1) project brief, (2) approved outline, (3) chapter brief, (4) evidence bundle, (5) paragraph-level claims, (6) English draft, (7) citation and consistency self-check.",
    `Document type: ${manuscript.documentType}. Section: ${section.number} ${section.title}. Target words: ${section.targetWords}.`,
    `Project title: ${workspace.project.titleEn}. Registered primary outcome: ${workspace.project.primaryOutcome}. Never present a planned outcome as an observed result.`,
    `Approved outline:\n${outline}`,
    `Registered hypotheses:\n${hypotheses}`,
    `Locked studies:\n${workspace.experiments.map((experiment) => `${experiment.name}; ${experiment.design}; conditions: ${experiment.conditions.join(" | ")}; primary test: ${experiment.primaryTest}`).join("\n")}`,
    `Allowed evidence excerpts (only these may support external claims):\n${allowedEvidence || "No external evidence bundle is available; write only planned design content."}`,
    "Rules: write only the requested English section; do not invent citations, authors, dates, statistics, samples, scale properties or results; use future-oriented language for planned work; preserve the registered project studies exactly; use square-bracket evidence excerpt IDs only when directly supported; do not include Chinese text.",
  ].join("\n\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const result = await callOpenAICompatible({ settings, taskType: "english_academic_writing", explicitProfileId: parsed.data.profileId, prompt, systemPrompt: "Return a cautious, evidence-bounded English doctoral proposal section. Do not report unobserved results.", temperature: 0.2, signal: controller.signal });
    await recordGenerationAttempts("english_academic_writing", result.attempts);
    const saved = saveSectionDraft({ manuscriptId: manuscript.id, sectionId: section.id, content: result.content.trim(), changeSummary: "AI layered draft generated; human review required", editor: parsed.data.editor, generatedBy: `${result.profile.provider}/${result.profile.model}`, promptTemplateVersion: "manuscript-layered-v1", researchStatus: section.researchStatus, manuscriptStatus: "draft" });
    return NextResponse.json({ ...saved, attempts: result.attempts, stages: ["project-brief", "approved-outline", "chapter-brief", "evidence-bundle", "paragraph-claims", "english-draft", "citation-validation", "consistency-review", "human-approval-pending"] });
  } catch (error) {
    if (error instanceof ProviderCallError) { await recordGenerationAttempts("english_academic_writing", error.attempts); return NextResponse.json({ error: "分层稿件生成失败。", category: error.category, attempts: error.attempts }, { status: 502 }); }
    return NextResponse.json({ error: "分层稿件生成失败。" }, { status: 502 });
  } finally { clearTimeout(timeout); }
}

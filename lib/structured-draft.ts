import { z } from "zod";
import { renderCitationTokens } from "./citation-service";
import type { SectionEvidenceBundle, StructuredSectionDraft, Work } from "./types";

const claimSchema = z.object({ claimId: z.string().min(1), claimText: z.string().min(1), kind: z.enum(["published_fact", "researcher_inference", "planned_hypothesis", "planned_method"]), evidenceExcerptIds: z.array(z.string()).default([]), citationWorkIds: z.array(z.string()).default([]) }).strict();
export const structuredSectionDraftSchema = z.object({ projectId: z.string(), documentId: z.string(), sectionId: z.string(), paragraphs: z.array(z.object({ markdown: z.string().min(1), claims: z.array(claimSchema).default([]) }).strict()).min(1), unsupportedStatements: z.array(z.object({ statement: z.string(), reason: z.string() }).strict()).default([]), assumptions: z.array(z.string()).default([]), evidenceGaps: z.array(z.string()).default([]) }).strict();

export function parseStructuredSectionDraft(value: unknown, bundle: SectionEvidenceBundle, works: Work[]): StructuredSectionDraft {
  let parsedValue = value;
  if (typeof value === "string") { try { parsedValue = JSON.parse(value); } catch { throw new Error("模型没有返回合法 JSON 结构化草稿。"); } }
  const parsed = structuredSectionDraftSchema.parse(parsedValue);
  if (parsed.projectId !== bundle.projectId || parsed.documentId !== bundle.documentId || parsed.sectionId !== bundle.sectionId) throw new Error("结构化草稿作用域与当前项目/章节不一致。");
  const allowedEvidence = new Set(bundle.claims.flatMap((claim) => claim.evidence.map((item) => item.evidenceExcerptId))); const allowedWorks = new Set(bundle.claims.flatMap((claim) => claim.evidence.map((item) => item.workId)));
  const claimMap = new Map(bundle.claims.map((claim) => [claim.claimId, claim]));
  for (const paragraph of parsed.paragraphs) {
    const rendered = renderCitationTokens(paragraph.markdown, works);
    if (rendered.unknownIds.length) throw new Error(`模型使用了当前项目之外的 Work：${rendered.unknownIds.join(", ")}`);
    const tokenWorkIds = new Set(rendered.citedWorkIds);
    const outsideBundle = [...tokenWorkIds].filter((id) => !allowedWorks.has(id));
    if (outsideBundle.length) throw new Error(`模型使用了当前证据包之外的 Work：${outsideBundle.join(", ")}`);
    for (const claim of paragraph.claims) {
      const registered = claimMap.get(claim.claimId); if (!registered) throw new Error(`模型返回了不存在的 Claim：${claim.claimId}`);
      if (claim.evidenceExcerptIds.some((id) => !allowedEvidence.has(id))) throw new Error(`模型使用了证据包之外的 EvidenceExcerpt：${claim.claimId}`);
      if (claim.citationWorkIds.some((id) => !allowedWorks.has(id))) throw new Error(`模型使用了证据包之外的 Work：${claim.claimId}`);
      if (claim.citationWorkIds.some((id) => !tokenWorkIds.has(id))) throw new Error(`Claim ${claim.claimId} 的 citationWorkIds 没有出现在正文 citation token 中。`);
      if (claim.kind === "published_fact" && !claim.evidenceExcerptIds.length) throw new Error(`published_fact ${claim.claimId} 缺少证据。`);
    }
  }
  return parsed;
}

export function draftMarkdown(draft: StructuredSectionDraft) { return draft.paragraphs.map((paragraph) => paragraph.markdown.trim()).filter(Boolean).join("\n\n"); }
export function draftCitationIds(draft: StructuredSectionDraft) { return [...new Set(draft.paragraphs.flatMap((paragraph) => paragraph.claims.flatMap((claim) => claim.citationWorkIds)))]; }
export function draftEvidenceIds(draft: StructuredSectionDraft) { return [...new Set(draft.paragraphs.flatMap((paragraph) => paragraph.claims.flatMap((claim) => claim.evidenceExcerptIds)))]; }

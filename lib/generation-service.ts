import { callOpenAICompatible, ProviderCallError } from "./provider-client";
import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "./storage";
import { buildSectionEvidenceBundle, bundlePrompt } from "./evidence-bundle";
import { parseStructuredSectionDraft, draftCitationIds, draftEvidenceIds, draftMarkdown } from "./structured-draft";
import { saveProjectSection, getProjectDocument } from "./project-documents";
import { runCitationAudit } from "./citation-audit";

export async function generateStructuredSection(input: { projectId: string; documentId: string; sectionId: string; profileId?: string; editor?: string; signal?: AbortSignal }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。"); const section = document.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === input.sectionId); if (!section) throw new Error("章节不存在。");
  const [settings, workspace, bundleResult] = await Promise.all([readPrivateSettings(), readWorkspace(input.projectId), buildSectionEvidenceBundle({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId })]);
  const bundle = bundleResult.bundle; if (bundle.mode === "formal" && bundle.unresolvedClaims.length) throw new Error("正式章节存在未解决的论断证据，已阻断生成。");
  const prompt = `Return JSON only matching this schema: {"projectId":string,"documentId":string,"sectionId":string,"paragraphs":[{"markdown":string,"claims":[{"claimId":string,"claimText":string,"kind":"published_fact|researcher_inference|planned_hypothesis|planned_method","evidenceExcerptIds":string[],"citationWorkIds":string[]}]}],"unsupportedStatements":[{"statement":string,"reason":string}],"assumptions":string[],"evidenceGaps":string[]}. Write one English section for ${document.documentType}: ${section.number} ${section.title}. Mode=${bundle.mode}. Do not invent authors, years, DOI, findings, samples or references. Use only claims and evidence in the bundle. Citation tokens must be [[CITE:work-id]] and only use work IDs present in evidence. Planned content must use future-oriented language.\n${bundlePrompt(bundle, { allowFullText: settings.allowFullText })}\nProject title: ${workspace.project.titleEn}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callOpenAICompatible({ settings, taskType: "english_academic_writing", explicitProfileId: input.profileId, prompt: attempt ? `${prompt}\nPrevious response failed schema validation. Return corrected JSON only.` : prompt, systemPrompt: "You are a cautious doctoral evidence agent. Output structured JSON only.", temperature: 0.1, signal: input.signal });
      await recordGenerationAttempts("english_academic_writing", result.attempts, { projectId: input.projectId, documentId: input.documentId });
      const draft = parseStructuredSectionDraft(result.content, bundle, workspace.works);
      const content = draftMarkdown(draft); const saved = saveProjectSection({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, content, changeSummary: bundle.mode === "formal" ? "Structured evidence-bounded draft" : "Exploratory structured draft; human verification required", editor: input.editor ?? "researcher", generatedBy: `${result.profile.provider}/${result.profile.model}`, citationIds: draftCitationIds(draft), claimIds: draft.paragraphs.flatMap((paragraph) => paragraph.claims.map((claim) => claim.claimId)), evidenceExcerptIds: draftEvidenceIds(draft), evidenceBundleId: bundle.id, unsupportedStatements: draft.unsupportedStatements, evidenceGaps: draft.evidenceGaps });
      const audit = await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId: saved.version.id, formal: bundle.mode === "formal" });
      return { ...saved, draft, audit, attempts: result.attempts, profile: result.profile };
    } catch (error) { lastError = error; if (error instanceof ProviderCallError) throw error; }
  }
  throw lastError instanceof Error ? lastError : new Error("结构化稿件生成失败。");
}

export async function proposeSectionRevision(input: { projectId: string; documentId: string; sectionId: string; profileId?: string; signal?: AbortSignal }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。");
  const section = document.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === input.sectionId); if (!section) throw new Error("章节不存在。");
  const [settings, workspace, bundleResult] = await Promise.all([readPrivateSettings(), readWorkspace(input.projectId), buildSectionEvidenceBundle({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId })]);
  const bundle = bundleResult.bundle;
  const prompt = `Return JSON only using the structured section schema. Revise the current section for evidence traceability and clarity. Preserve supported content, remove or explicitly flag unsupported published facts, and use only Work and EvidenceExcerpt IDs in the bundle. Citation tokens must be [[CITE:work-id]]. Do not invent references, findings, samples or statistics. Current section:\n${section.content}\n\nEvidence bundle:\n${bundlePrompt(bundle, { allowFullText: settings.allowFullText })}\n\nProject title: ${workspace.project.titleEn}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callOpenAICompatible({ settings, taskType: "english_academic_writing", explicitProfileId: input.profileId, prompt: attempt ? `${prompt}\nPrevious response failed schema validation. Return corrected JSON only.` : prompt, systemPrompt: "You are a cautious doctoral revision assistant. Output structured JSON only and never invent evidence.", temperature: 0.1, signal: input.signal });
      await recordGenerationAttempts("english_academic_writing", result.attempts, { projectId: input.projectId, documentId: input.documentId });
      const draft = parseStructuredSectionDraft(result.content, bundle, workspace.works);
      return { beforeText: section.content, afterText: draftMarkdown(draft), draft, citationIds: draftCitationIds(draft), claimIds: draft.paragraphs.flatMap((paragraph) => paragraph.claims.map((claim) => claim.claimId)), evidenceExcerptIds: draftEvidenceIds(draft), evidenceBundleId: bundle.id, profile: result.profile, attempts: result.attempts };
    } catch (error) { lastError = error; if (error instanceof ProviderCallError) throw error; }
  }
  throw lastError instanceof Error ? lastError : new Error("章节修订建议生成失败。");
}

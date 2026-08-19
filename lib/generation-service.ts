import { callOpenAICompatible, ProviderCallError } from "./provider-client";
import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "./storage";
import { buildSectionEvidenceBundle, bundlePrompt } from "./evidence-bundle";
import { parseStructuredSectionDraft, draftCitationIds, draftEvidenceIds, draftMarkdown } from "./structured-draft";
import { activateDocumentVersion, getProjectDocument, quarantineDocumentVersion, stageProjectSectionVersion, updateDocumentVersionCitationLocations } from "./project-documents";
import { runCitationAudit } from "./citation-audit";
import { saveQuarantinedDraft } from "./evidence-store";
import type { ProjectDocument } from "./project-documents";
import type { ClaimEvidenceCitationBinding, StructuredSectionDraft } from "./types";
import { compileClaimCoverage, deterministicClaimCoverageClassifier, type ClaimCoverageClassifier } from "./claim-coverage";
import { listEvidenceExcerpts } from "./evidence-excerpts";
import { createClaimEvidenceCitationBinding } from "./claim-evidence-binding";
import { createHash } from "node:crypto";

function candidateDocument(document: ProjectDocument, sectionId: string, content: string, draft: ReturnType<typeof parseStructuredSectionDraft>) {
  const candidate = structuredClone(document);
  const section = candidate.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === sectionId);
  if (!section) throw new Error("章节不存在。");
  section.content = content;
  section.citationIds = draftCitationIds(draft);
  section.claimIds = draft.paragraphs.flatMap((paragraph) => paragraph.claims.map((claim) => claim.claimId));
  section.evidenceExcerptIds = draftEvidenceIds(draft);
  section.unsupportedStatements = draft.unsupportedStatements;
  section.evidenceGaps = draft.evidenceGaps;
  return candidate;
}

function classifierForDraft(draft: StructuredSectionDraft): ClaimCoverageClassifier {
  const claims = draft.paragraphs.flatMap((paragraph) => paragraph.claims);
  return { async classify(input) { const fallback = await deterministicClaimCoverageClassifier.classify(input); return input.sentences.map((sentence, index) => { const matching = claims.filter((claim) => sentence.text.includes(claim.claimText.trim())); if (!matching.length) return fallback[index]; const kinds = matching.map((claim) => claim.kind); const classification = kinds.includes("published_fact") ? "published_fact" : kinds.includes("planned_method") ? "planned_method" : kinds.includes("planned_hypothesis") ? "planned_hypothesis" : "researcher_inference"; return { sentenceId: sentence.sentenceId, classification, claimSpans: matching.map((claim) => { const startOffset = Math.max(0, sentence.text.indexOf(claim.claimText.trim())); return { text: claim.claimText, startOffset, endOffset: startOffset + claim.claimText.trim().length, suggestedClaimId: claim.claimId }; }), confidence: 1, rationaleCode: "structured-draft-claim-span" }; }) as Awaited<ReturnType<ClaimCoverageClassifier["classify"]>>; } };
}

async function provisionalBindings(input: { projectId: string; documentId: string; versionId: string; draft: StructuredSectionDraft; coverage: Awaited<ReturnType<typeof compileClaimCoverage>> }) {
  const excerpts = await listEvidenceExcerpts({ projectId: input.projectId }); const bindings: ClaimEvidenceCitationBinding[] = [];
  for (const claim of input.draft.paragraphs.flatMap((paragraph) => paragraph.claims)) {
    const sentence = input.coverage.paragraphs.flatMap((paragraph) => paragraph.sentences).find((item) => item.claimIds?.includes(claim.claimId)); if (!sentence) continue;
    for (const evidenceExcerptId of claim.evidenceExcerptIds) { const excerpt = excerpts.find((item) => item.id === evidenceExcerptId); if (!excerpt || !claim.citationWorkIds.includes(excerpt.workId)) continue; const citationIndex = sentence.citationWorkIds.indexOf(excerpt.workId); if (citationIndex < 0 || !sentence.citationItemIds?.[citationIndex]) continue; bindings.push({ id: `binding-${input.versionId}-${claim.claimId}-${evidenceExcerptId}`.slice(0, 220), projectId: input.projectId, documentId: input.documentId, documentVersionId: input.versionId, sectionId: input.draft.sectionId, sentenceId: sentence.sentenceId, claimId: claim.claimId, evidenceExcerptId, workId: excerpt.workId, citationItemId: sentence.citationItemIds[citationIndex], relation: excerpt.supportDirection === "contradicting" ? "contradicts" : excerpt.supportDirection === "context-only" ? "background" : excerpt.supportDirection === "mixed" ? "qualifies" : "supports", createdAt: new Date().toISOString() }); }
  }
  return bindings;
}

export async function auditProvisionalDraft(input: { projectId: string; documentId: string; provisionalDocument: ProjectDocument; draft: StructuredSectionDraft; formal: boolean }) {
  const classifier = classifierForDraft(input.draft); const versionId = `provisional:${createHash("sha256").update(JSON.stringify({ documentId: input.documentId, draft: input.draft })).digest("hex")}`;
  const initialCoverage = await compileClaimCoverage({ projectId: input.projectId, documentId: input.documentId, documentVersionId: versionId, documentOverride: input.provisionalDocument, persist: false, classifier, provisionalBindings: [] });
  const bindings = await provisionalBindings({ projectId: input.projectId, documentId: input.documentId, versionId, draft: input.draft, coverage: initialCoverage });
  const audit = await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId, formal: input.formal, documentOverride: input.provisionalDocument, persist: false, classifier, provisionalBindings: bindings });
  return { audit, coverage: await compileClaimCoverage({ projectId: input.projectId, documentId: input.documentId, documentVersionId: versionId, documentOverride: input.provisionalDocument, persist: false, classifier, provisionalBindings: bindings }), bindings, classifier };
}

export async function promoteStructuredDraft(input: { projectId: string; documentId: string; sectionId: string; draft: StructuredSectionDraft; editor?: string; generatedBy?: string; evidenceBundleId?: string; idempotencyKey: string }) {
  const current = getProjectDocument(input.projectId, input.documentId); if (!current) throw new Error("文档不存在。"); const content = draftMarkdown(input.draft); const candidate = candidateDocument(current, input.sectionId, content, input.draft);
  const provisional = await auditProvisionalDraft({ projectId: input.projectId, documentId: input.documentId, provisionalDocument: candidate, draft: input.draft, formal: current.evidenceMode === "formal" });
  if (provisional.audit.blockers.length) { const quarantined = saveQuarantinedDraft({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, content, structuredDraft: input.draft, blockers: provisional.audit.blockers, warnings: provisional.audit.warnings, status: "blocked" }); return { status: "quarantined" as const, quarantined, draft: input.draft, audit: provisional.audit }; }
  const staged = stageProjectSectionVersion({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, content, editor: input.editor ?? "researcher", generatedBy: input.generatedBy, citationIds: draftCitationIds(input.draft), claimIds: input.draft.paragraphs.flatMap((paragraph) => paragraph.claims.map((claim) => claim.claimId)), evidenceExcerptIds: draftEvidenceIds(input.draft), evidenceBundleId: input.evidenceBundleId, unsupportedStatements: input.draft.unsupportedStatements, evidenceGaps: input.draft.evidenceGaps, expectedVersion: current.currentVersionNumber, idempotencyKey: input.idempotencyKey });
  if (staged.documentVersion.lifecycleStatus === "reviewable") return { status: "promoted" as const, ...staged, draft: input.draft, audit: await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId: staged.documentVersion.id, formal: true, classifier: provisional.classifier }) };
  const coverage = await compileClaimCoverage({ projectId: input.projectId, documentId: input.documentId, versionId: staged.documentVersion.id, classifier: provisional.classifier }); updateDocumentVersionCitationLocations(input.projectId, input.documentId, staged.documentVersion.id, coverage.paragraphs.flatMap((paragraph) => paragraph.sentences));
  for (const binding of provisional.bindings) await createClaimEvidenceCitationBinding({ ...binding, id: undefined, createdAt: undefined, documentVersionId: staged.documentVersion.id });
  const audit = await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId: staged.documentVersion.id, formal: current.evidenceMode === "formal", classifier: provisional.classifier });
  if (audit.blockers.length) { quarantineDocumentVersion(input.projectId, input.documentId, staged.documentVersion.id); const quarantined = saveQuarantinedDraft({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, content, structuredDraft: input.draft, coverageReportId: audit.claimCoverageReportId, citationAuditReportId: audit.id, blockers: audit.blockers, warnings: audit.warnings, status: "blocked" }); return { status: "quarantined" as const, quarantined, documentVersion: staged.documentVersion, draft: input.draft, audit }; }
  const document = activateDocumentVersion(input.projectId, input.documentId, staged.documentVersion.id); return { status: "promoted" as const, document, documentVersion: { ...staged.documentVersion, lifecycleStatus: "reviewable" as const }, draft: input.draft, audit };
}

export async function generateStructuredSection(input: { projectId: string; documentId: string; sectionId: string; profileId?: string; editor?: string; guidance?: string; signal?: AbortSignal; idempotencyKey?: string }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。"); const section = document.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === input.sectionId); if (!section) throw new Error("章节不存在。");
  const [settings, workspace, bundleResult] = await Promise.all([readPrivateSettings(), readWorkspace(input.projectId), buildSectionEvidenceBundle({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId })]);
  const bundle = bundleResult.bundle; if (bundle.mode === "formal" && bundle.unresolvedClaims.length) throw new Error("正式章节存在未解决的论断证据，已阻断生成。");
  const guidance = input.guidance?.trim().slice(0, 40_000);
  const prompt = `Return JSON only matching this schema: {"projectId":string,"documentId":string,"sectionId":string,"paragraphs":[{"markdown":string,"claims":[{"claimId":string,"claimText":string,"kind":"published_fact|researcher_inference|planned_hypothesis|planned_method","evidenceExcerptIds":string[],"citationWorkIds":string[]}]}],"unsupportedStatements":[{"statement":string,"reason":string}],"assumptions":string[],"evidenceGaps":string[]}. Write one English section for ${document.documentType}: ${section.number} ${section.title}. Mode=${bundle.mode}. Do not invent authors, years, DOI, findings, samples or references. Use only claims and evidence in the bundle. Citation tokens must be [[CITE:work-id]] and only use work IDs present in evidence. Planned content must use future-oriented language.\n${bundlePrompt(bundle, { allowFullText: settings.allowFullText })}\nProject title: ${workspace.project.titleEn}${guidance ? `\nProject-specific drafting brief (planning context only, not verified evidence):\n${guidance}` : ""}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await callOpenAICompatible({ settings, taskType: "english_academic_writing", explicitProfileId: input.profileId, prompt: attempt ? `${prompt}\nPrevious response failed schema validation. Return corrected JSON only.` : prompt, systemPrompt: "You are a cautious doctoral evidence agent. Output structured JSON only.", temperature: 0.1, signal: input.signal });
      await recordGenerationAttempts("english_academic_writing", result.attempts, { projectId: input.projectId, documentId: input.documentId });
      const draft = parseStructuredSectionDraft(result.content, bundle, workspace.works);
      const content = draftMarkdown(draft);
      const promoted = await promoteStructuredDraft({ projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, draft, editor: input.editor, generatedBy: `${result.profile.provider}/${result.profile.model}`, evidenceBundleId: bundle.id, idempotencyKey: input.idempotencyKey ?? createHash("sha256").update(`${input.projectId}:${input.documentId}:${input.sectionId}:${content}`).digest("hex") });
      return { ...promoted, attempts: result.attempts, profile: result.profile };
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

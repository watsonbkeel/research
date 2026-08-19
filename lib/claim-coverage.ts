import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { readWorkspace } from "./storage";
import { getProjectDocument, documentForVersion, projectDocumentContentHash, type ProjectDocument } from "./project-documents";
import { listEvidenceExcerpts, effectiveVerificationStatus } from "./evidence-excerpts";
import { claimEvidenceCitationBindingsForVersion, ensureEvidenceSchema } from "./evidence-store";
import { portfolioDatabase } from "./portfolio";
import { readPrivateSettings } from "./storage";
import { callOpenAICompatible } from "./provider-client";
import type { AuditIssue, ClaimCoverageReport, CoverageClassification, ParagraphCoverage, ParsedParagraph, CitationOffset, SentenceClassificationResult } from "./types";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const citationPattern = /\[\[CITE:([^\]]+)\]\]/g;

export interface ClaimCoverageClassifierInput { projectId: string; documentId: string; sectionId: string; sectionTitle: string; paragraph: ParsedParagraph; sentences: Array<{ sentenceId: string; text: string; startOffset: number; endOffset: number }> }
export interface ClaimCoverageClassifier { classify(input: ClaimCoverageClassifierInput): Promise<SentenceClassificationResult[]> }
const classificationSchema = z.array(z.object({ sentenceId: z.string(), classification: z.enum(["published_fact", "researcher_inference", "planned_hypothesis", "planned_method", "literature_definition", "author_defined_term", "connective", "heading", "unknown"]), claimSpans: z.array(z.object({ text: z.string(), startOffset: z.number().int().nonnegative(), endOffset: z.number().int().nonnegative(), suggestedClaimId: z.string().optional() })), confidence: z.number().min(0).max(1), rationaleCode: z.string().min(1) }));

function sentenceBoundaries(rawText: string) {
  const boundaries: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (let index = 0; index < rawText.length; index += 1) {
    const character = rawText[index]; const chineseBoundary = /[。！？；]/u.test(character) || rawText.slice(index, index + 2) === "……"; const englishBoundary = /[.!?;]/u.test(character);
    if (!chineseBoundary && !englishBoundary) continue;
    let end = index + (rawText.slice(index, index + 2) === "……" ? 2 : 1);
    while (/['"”’\])}]/u.test(rawText[end] ?? "")) end += 1;
    if (!chineseBoundary && end < rawText.length && !/\s|\n/u.test(rawText[end])) continue;
    if (rawText.slice(start, end).trim()) boundaries.push({ start, end });
    start = end;
    while (/\s/u.test(rawText[start] ?? "")) start += 1;
  }
  if (rawText.slice(start).trim()) boundaries.push({ start, end: rawText.length });
  return boundaries;
}

function plainWithTokens(rawText: string) { return rawText.replace(citationPattern, (match) => " ".repeat(match.length)); }

export function parseParagraph(rawText: string, paragraphId: string, startOffset = 0): ParsedParagraph {
  const citations: CitationOffset[] = [];
  for (const match of rawText.matchAll(citationPattern)) {
    const raw = match[1] ?? ""; const local = match.index ?? 0;
    const base = citations.length; raw.split(";").map((item) => item.trim()).filter(Boolean).forEach((workId, index) => citations.push({ citationItemId: `${paragraphId}-citation-${base + index + 1}`, workId, startOffset: startOffset + local, endOffset: startOffset + local + match[0].length }));
  }
  return { paragraphId, rawText, plainText: plainWithTokens(rawText), startOffset, endOffset: startOffset + rawText.length, citations };
}

export function splitSentences(text: string): string[] { return sentenceBoundaries(text).map(({ start, end }) => plainWithTokens(text.slice(start, end)).trim()).filter(Boolean); }

function deterministicClassification(text: string): Exclude<CoverageClassification, "definition"> {
  const value = text.trim();
  if (!value) return "connective";
  if (/^#+\s|^\d+(?:\.\d+)*\s/u.test(value)) return "heading";
  if (/^(and|but|however|therefore|thus|in contrast|moreover|also|this section|overall)\b/i.test(value) && value.split(/\s+/u).length < 24) return "connective";
  if (/\b(?:we|the authors?)\s+(?:define|conceptualize|operationalize)|在本文中(?:将|定义|称为)/iu.test(value)) return "author_defined_term";
  if (/\b(?:defined as|is defined|refers to|means that)|(?:literature|researchers?)\s+(?:define|describe)/iu.test(value)) return "literature_definition";
  if (/已有研究|研究表明|研究发现|研究证明|\b(?:prior|published|empirical|existing)\s+(?:research|studies?)\b|\b(?:research|studies?)\s+(?:shows?|demonstrates?|found|reported|established)\b|\b(?:significant|associated|effect|relationship)\b/iu.test(value)) return "published_fact";
  if (/\b(?:we argue|we infer|this suggests|we propose|may indicate|could reflect|in our view)\b|本文认为|本文推断/iu.test(value)) return "researcher_inference";
  if (/\b(?:hypothes(?:is|es)|predict|expect(?:ed)?|will test|is expected to|we anticipate|预计|假设)/iu.test(value)) return "planned_hypothesis";
  if (/\b(?:will collect|will recruit|will measure|will analyze|proposed method|sampling|sample size|power analysis|regression|experiment|量表|样本量|统计模型)/iu.test(value)) return "planned_method";
  return "unknown";
}

export const deterministicClaimCoverageClassifier: ClaimCoverageClassifier = { async classify(input) { return input.sentences.map((sentence) => ({ sentenceId: sentence.sentenceId, classification: deterministicClassification(sentence.text), claimSpans: [], confidence: 0.55, rationaleCode: "deterministic-rules-v2" })); } };
export const modelClaimCoverageClassifier: ClaimCoverageClassifier = { async classify(input) { const settings = await readPrivateSettings(); const result = await callOpenAICompatible({ settings, taskType: "citation_validation", temperature: 0, systemPrompt: "Classify research prose conservatively. Return JSON only. Never treat a heading or chapter title as proof that a factual sentence is a definition or source-free method.", prompt: `Return a JSON array matching {sentenceId,classification,claimSpans:[{text,startOffset,endOffset,suggestedClaimId?}],confidence,rationaleCode}. Allowed classifications: published_fact,researcher_inference,planned_hypothesis,planned_method,literature_definition,author_defined_term,connective,heading,unknown. Section title is context only: ${input.sectionTitle}. Sentences:\n${JSON.stringify(input.sentences)}` }); const raw = result.content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""); return classificationSchema.parse(JSON.parse(raw)); } };

function documentContentHash(document: ProjectDocument) { return projectDocumentContentHash(document); }
function claimSpanIds(text: string, sectionClaimIds: string[], claims: Array<{ id: string; text: string }>, classified?: SentenceClassificationResult) {
  const suggested = classified?.claimSpans.map((span) => span.suggestedClaimId).filter((id): id is string => Boolean(id && sectionClaimIds.includes(id)));
  if (suggested?.length) return [...new Set(suggested)];
  const matches = claims.filter((claim) => sectionClaimIds.includes(claim.id) && claim.text.trim() && (text.includes(claim.text) || claim.text.includes(text)));
  if (matches.length) return matches.map((claim) => claim.id);
  return [];
}

export async function compileClaimCoverage(input: { projectId: string; documentId: string; versionId?: string; documentVersionId?: string; documentOverride?: ProjectDocument; persist?: boolean; classifier?: ClaimCoverageClassifier; classifierMode?: "model" | "deterministic"; provisionalBindings?: import("./types").ClaimEvidenceCitationBinding[] }): Promise<ClaimCoverageReport> {
  ensureEvidenceSchema();
  const current = getProjectDocument(input.projectId, input.documentId); if (!current) throw new Error("文档不存在。");
  const document = input.documentOverride ?? (input.versionId ? documentForVersion(current, input.versionId) : current); if (!document) throw new Error("指定 DocumentVersion 不存在。");
  const workspace = document.versionSnapshot?.workspaceSnapshot ?? await readWorkspace(input.projectId); const excerpts = document.versionSnapshot?.evidenceExcerptsSnapshot as Awaited<ReturnType<typeof listEvidenceExcerpts>> | undefined ?? await listEvidenceExcerpts({ projectId: input.projectId });
  const versionId = input.documentVersionId ?? input.versionId ?? document.currentVersionId ?? document.manuscript.version; const contentHash = documentContentHash(document); const classifier = input.classifier ?? (input.classifierMode === "model" ? modelClaimCoverageClassifier : deterministicClaimCoverageClassifier); const bindings = input.provisionalBindings ?? claimEvidenceCitationBindingsForVersion(input.projectId, input.documentId, versionId);
  const paragraphs: ParagraphCoverage[] = []; const blockers: AuditIssue[] = []; const warnings: AuditIssue[] = [];
  let sentenceCount = 0, publishedFactCount = 0, supportedPublishedFactCount = 0, unsupportedPublishedFactCount = 0, unknownCount = 0;
  for (const chapter of document.manuscript.chapters) for (const section of chapter.sections) {
    let sectionCursor = 0;
    for (const raw of section.content.split(/\n\s*\n/u)) {
      const leading = section.content.indexOf(raw, sectionCursor); if (leading < 0 || !raw.trim()) { sectionCursor += raw.length + 2; continue; } sectionCursor = leading + raw.length;
      const paragraph = parseParagraph(raw, `${section.id}-p${paragraphs.length + 1}`, leading);
      const boundaries = sentenceBoundaries(raw); const sentenceInputs = boundaries.map((span, index) => ({ sentenceId: `${paragraph.paragraphId}-s${index + 1}`, text: plainWithTokens(raw.slice(span.start, span.end)).trim(), startOffset: leading + span.start, endOffset: leading + span.end }));
      let classified: SentenceClassificationResult[];
      try { classified = classificationSchema.parse(await classifier.classify({ projectId: input.projectId, documentId: input.documentId, sectionId: section.id, sectionTitle: section.title, paragraph, sentences: sentenceInputs })); } catch (error) { classified = sentenceInputs.map((sentence) => ({ sentenceId: sentence.sentenceId, classification: "unknown", claimSpans: [], confidence: 0, rationaleCode: "classifier-unavailable" })); warnings.push({ code: "classifier-unavailable", severity: "warning", message: error instanceof Error ? error.message : "Claim classifier unavailable", sectionId: section.id }); }
      const sentences = sentenceInputs.map((sentence) => {
        const model = classified.find((item) => item.sentenceId === sentence.sentenceId); const deterministic = deterministicClassification(sentence.text); const safetyOverride = model?.rationaleCode !== "classifier-unavailable" && ["published_fact", "literature_definition", "author_defined_term", "planned_method", "planned_hypothesis"].includes(deterministic); const classification = safetyOverride ? deterministic : model?.classification ?? "unknown"; const claimIds = claimSpanIds(sentence.text, section.claimIds, workspace.claims, model); const evidence = excerpts.filter((excerpt) => claimIds.includes(excerpt.claimId ?? "") && effectiveVerificationStatus(excerpt) !== "rejected"); const citations = paragraph.citations.filter((citation) => citation.startOffset < sentence.endOffset && citation.endOffset > sentence.startOffset); const citationWorkIds = citations.map((citation) => citation.workId);
        const requiresEvidence = ["published_fact", "literature_definition", "planned_method", "planned_hypothesis"].includes(classification);
        const exactEvidence = claimIds.flatMap((claimId) => bindings.filter((binding) => binding.sentenceId === sentence.sentenceId && binding.claimId === claimId && binding.documentVersionId === versionId && ["supports", "qualifies"].includes(binding.relation)).map((binding) => ({ binding, excerpt: evidence.find((item) => item.id === binding.evidenceExcerptId), citation: citations.find((item) => item.citationItemId === binding.citationItemId) }))).filter((item) => item.excerpt && item.citation && item.excerpt.workId === item.binding.workId && item.citation.workId === item.binding.workId && effectiveVerificationStatus(item.excerpt) === "human_verified" && Boolean(item.excerpt.page || item.excerpt.locator) && item.excerpt.supportDirection !== "contradicting");
        const coverageStatus = classification === "connective" || classification === "heading" || classification === "author_defined_term" ? "not_required" : classification === "unknown" ? "unclassified" : claimIds.length && (!requiresEvidence || (citations.length > 0 && exactEvidence.length > 0)) ? "covered" : "unsupported";
        sentenceCount += 1; if (classification === "published_fact" || classification === "literature_definition") publishedFactCount += 1; if ((classification === "published_fact" || classification === "literature_definition") && coverageStatus === "covered") supportedPublishedFactCount += 1; if ((classification === "published_fact" || classification === "literature_definition") && coverageStatus !== "covered") unsupportedPublishedFactCount += 1; if (classification === "unknown") unknownCount += 1;
        if (document.evidenceMode === "formal") { if (classification === "unknown") blockers.push({ code: "unknown-sentence", severity: "blocker", message: `句子无法安全分类：${sentence.text.slice(0, 180)}`, sectionId: section.id }); if (requiresEvidence && (!claimIds.length || !evidence.length)) blockers.push({ code: classification === "published_fact" || classification === "literature_definition" ? "uncovered-published-fact" : "uncovered-method-or-hypothesis-source", severity: "blocker", message: `该句需要精确 Claim 和 EvidenceExcerpt：${sentence.text.slice(0, 180)}`, sectionId: section.id, claimId: claimIds[0] }); }
        return { sentenceId: sentence.sentenceId, text: sentence.text, startOffset: sentence.startOffset, endOffset: sentence.endOffset, classification, claimId: claimIds[0], claimIds, evidenceExcerptIds: [...new Set(evidence.map((item) => item.id))], citationWorkIds, citationItemIds: citations.map((item) => item.citationItemId), coverageStatus: coverageStatus as ParagraphCoverage["sentences"][number]["coverageStatus"] };
      });
      paragraphs.push({ paragraphId: paragraph.paragraphId, sectionId: section.id, rawText: paragraph.rawText, plainText: paragraph.plainText, startOffset: paragraph.startOffset, endOffset: paragraph.endOffset, citations: paragraph.citations, textHash: digest(paragraph.rawText), sentences, coverageRatio: sentences.length ? sentences.filter((item) => ["covered", "not_required"].includes(item.coverageStatus)).length / sentences.length : 1 });
    }
  }
  const report: ClaimCoverageReport = { id: `claim-coverage-${randomUUID()}`, projectId: input.projectId, documentId: input.documentId, versionId, documentVersionId: versionId, contentHash, status: blockers.length ? "blocked" : warnings.length || unknownCount ? "passed_with_warnings" : "passed", paragraphs, blockers, warnings, totals: { sentenceCount, publishedFactCount, supportedPublishedFactCount, unsupportedPublishedFactCount, unknownCount }, checkedAt: new Date().toISOString(), checkerVersion: "claim-coverage-v2-offset-classifier" };
  if (input.persist !== false) portfolioDatabase().prepare("INSERT OR REPLACE INTO claim_coverage_reports (id,project_id,document_id,version_id,status,payload_json,checked_at) VALUES (?,?,?,?,?,?,?)").run(report.id, report.projectId, report.documentId, report.versionId, report.status, JSON.stringify(report), report.checkedAt);
  return report;
}

export function latestClaimCoverage(projectId: string, documentId: string): ClaimCoverageReport | undefined { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM claim_coverage_reports WHERE project_id=? AND document_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId) as { payload?: string } | undefined; if (!row?.payload) return undefined; try { return JSON.parse(row.payload) as ClaimCoverageReport; } catch { return undefined; } }
export function claimCoverageForVersion(projectId: string, documentId: string, versionId: string): ClaimCoverageReport | undefined { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM claim_coverage_reports WHERE project_id=? AND document_id=? AND version_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId, versionId) as { payload?: string } | undefined; if (!row?.payload) return undefined; try { return JSON.parse(row.payload) as ClaimCoverageReport; } catch { return undefined; } }
export function coverageWorkIds(report: ClaimCoverageReport) { return [...new Set(report.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => sentence.citationWorkIds)))]; }

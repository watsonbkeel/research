import { createHash, randomUUID } from "node:crypto";
import { readWorkspace } from "./storage";
import { getProjectDocument, type ProjectDocument } from "./project-documents";
import { listEvidenceExcerpts, effectiveVerificationStatus } from "./evidence-excerpts";
import { ensureEvidenceSchema } from "./evidence-store";
import { portfolioDatabase } from "./portfolio";
import type { AuditIssue, ClaimCoverageReport, CoverageClassification, ParagraphCoverage } from "./types";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function splitSentences(text: string): string[] {
  return text.replace(/\[\[CITE:[^\]]+\]\]/g, " ").split(/(?<=[.!?。！？])\s+|\n+/u).map((value) => value.trim()).filter(Boolean);
}

function classifySentence(text: string, sectionTitle: string, claimTexts: string[]): CoverageClassification {
  if (!text.trim()) return "connective";
  if (/^#+\s|^\d+(?:\.\d+)*\s/.test(text)) return "heading";
  if (/^(and|but|however|therefore|thus|in contrast|moreover|also|this section|overall)\b/i.test(text) && text.split(/\s+/).length < 24) return "connective";
  if (/\b(?:will|would|is expected to|we plan to|the proposed|hypothes(?:is|es)|aims? to|intend(?:s)? to)\b/i.test(text)) return /hypothes|predict|expect/i.test(text) ? "planned_hypothesis" : "planned_method";
  if (/\b(?:we argue|we infer|this suggests|we propose|may indicate|could reflect|in our view)\b/i.test(text)) return "researcher_inference";
  if (/\b(?:define|refers to|is defined as|means that)\b/i.test(text) || /definition|theor|construct/i.test(sectionTitle)) return "definition";
  if (claimTexts.some((claim) => claim.length > 20 && (text.includes(claim) || claim.includes(text)))) return "published_fact";
  if (/\b(?:study|research|evidence|literature|authors?|published|reported|found|shows?|demonstrates?|data|effect|relationship|associated|significant)\b/i.test(text)) return "published_fact";
  return "unknown";
}

function citationIds(text: string): string[] {
  return [...text.matchAll(/\[\[CITE:([^\]]+)\]\]/g)].flatMap((match) => match[1].split(";").map((id) => id.trim()).filter(Boolean));
}

export async function compileClaimCoverage(input: { projectId: string; documentId: string; versionId?: string; documentOverride?: ProjectDocument; persist?: boolean }): Promise<ClaimCoverageReport> {
  ensureEvidenceSchema();
  const document = input.documentOverride ?? getProjectDocument(input.projectId, input.documentId);
  if (!document) throw new Error("文档不存在。");
  const workspace = await readWorkspace(input.projectId);
  const excerpts = await listEvidenceExcerpts({ projectId: input.projectId });
  const claims = workspace.claims;
  const paragraphs: ParagraphCoverage[] = [];
  const blockers: AuditIssue[] = [];
  const warnings: AuditIssue[] = [];
  for (const section of document.manuscript.chapters.flatMap((chapter) => chapter.sections)) {
    const rawParagraphs = section.content.split(/\n\s*\n/).map((value) => value.trim()).filter(Boolean);
    rawParagraphs.forEach((paragraph, paragraphIndex) => {
      const sentences = splitSentences(paragraph);
      const coveredSentences = sentences.map((text, sentenceIndex) => {
        const linkedClaim = claims.find((claim) => section.claimIds.includes(claim.id) && (text.includes(claim.text) || claim.text.includes(text) || (section.claimIds.length === 1 && sentences.length === 1)));
        const classification = classifySentence(text, section.title, claims.filter((claim) => section.claimIds.includes(claim.id)).map((claim) => claim.text));
        const evidenceIds = linkedClaim ? excerpts.filter((excerpt) => excerpt.claimId === linkedClaim.id && effectiveVerificationStatus(excerpt) !== "rejected").map((excerpt) => excerpt.id) : [];
        const ids = citationIds(text);
        const coverageStatus = classification === "connective" || classification === "heading" ? "not_required" : linkedClaim && (classification !== "published_fact" || evidenceIds.length > 0) ? "covered" : classification === "unknown" ? "unclassified" : "unsupported";
        const item = { sentenceId: `${section.id}-p${paragraphIndex + 1}-s${sentenceIndex + 1}`, text, classification, ...(linkedClaim ? { claimId: linkedClaim.id } : {}), evidenceExcerptIds: evidenceIds, citationWorkIds: ids, coverageStatus: coverageStatus as ParagraphCoverage["sentences"][number]["coverageStatus"] };
        if (document.evidenceMode === "formal") {
          if (coverageStatus === "unclassified") blockers.push({ code: "unclassified-sentence", severity: "blocker", message: `句子未能分类为事实、推论、计划或连接语：${text.slice(0, 180)}`, sectionId: section.id });
          if (classification === "published_fact" && (!linkedClaim || evidenceIds.length === 0)) blockers.push({ code: "uncovered-published-fact", severity: "blocker", message: `外部事实句没有 Claim 和 EvidenceExcerpt：${text.slice(0, 180)}`, sectionId: section.id, claimId: linkedClaim?.id });
          if (classification === "planned_method" && !linkedClaim) warnings.push({ code: "method-source-unmapped", severity: "warning", message: `计划方法句尚未映射到 Claim：${text.slice(0, 180)}`, sectionId: section.id });
        }
        return item;
      });
      const covered = coveredSentences.filter((item) => ["covered", "not_required"].includes(item.coverageStatus)).length;
      paragraphs.push({ paragraphId: `${section.id}-p${paragraphIndex + 1}`, sectionId: section.id, textHash: hash(paragraph), sentences: coveredSentences, coverageRatio: coveredSentences.length ? covered / coveredSentences.length : 1 });
    });
  }
  const report: ClaimCoverageReport = { id: `claim-coverage-${randomUUID()}`, projectId: input.projectId, documentId: input.documentId, versionId: input.versionId ?? document.currentVersionId ?? document.manuscript.version, status: blockers.length ? "blocked" : warnings.length ? "passed_with_warnings" : "passed", paragraphs, blockers, warnings, checkedAt: new Date().toISOString(), checkerVersion: "claim-coverage-v1" };
  if (input.persist !== false) portfolioDatabase().prepare("INSERT OR REPLACE INTO claim_coverage_reports (id,project_id,document_id,version_id,status,payload_json,checked_at) VALUES (?,?,?,?,?,?,?)").run(report.id, report.projectId, report.documentId, report.versionId, report.status, JSON.stringify(report), report.checkedAt);
  return report;
}

export function latestClaimCoverage(projectId: string, documentId: string): ClaimCoverageReport | undefined {
  ensureEvidenceSchema();
  const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM claim_coverage_reports WHERE project_id=? AND document_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId) as { payload?: string } | undefined;
  if (!row?.payload) return undefined;
  try { return JSON.parse(row.payload) as ClaimCoverageReport; } catch { return undefined; }
}

export function coverageWorkIds(report: ClaimCoverageReport) { return [...new Set(report.paragraphs.flatMap((paragraph) => paragraph.sentences.flatMap((sentence) => sentence.citationWorkIds)))]; }

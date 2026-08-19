import { randomUUID } from "node:crypto";
import { getProjectDocument } from "./project-documents";
import { readWorkspace } from "./storage";
import { effectiveVerificationStatus, listEvidenceExcerpts } from "./evidence-excerpts";
import { latestCitationAudit, saveCitationAudit } from "./evidence-store";
import { parseCitationTokens, renderCitationTokens } from "./citation-service";
import { fullTextContainsQuote } from "./full-text";
import type { AuditIssue, CitationAuditReport } from "./types";
import type { ProjectDocument } from "./project-documents";
import { compileClaimCoverage } from "./claim-coverage";

export async function runCitationAudit(input: { projectId: string; documentId: string; versionId?: string; formal?: boolean; documentOverride?: ProjectDocument; persist?: boolean }) {
  const document = input.documentOverride ?? getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。"); const workspace = await readWorkspace(input.projectId); const excerpts = await listEvidenceExcerpts({ projectId: input.projectId });
  const formal = input.formal ?? document.evidenceMode === "formal";
  const blockers: AuditIssue[] = [], warnings: AuditIssue[] = [], cited = new Set<string>(); const works = new Map(workspace.works.map((work) => [work.id, work]));
  for (const section of document.manuscript.chapters.flatMap((chapter) => chapter.sections)) {
    const tokens = parseCitationTokens(section.content); const result = renderCitationTokens(section.content, workspace.works); result.citedWorkIds.forEach((id) => cited.add(id));
    for (const id of result.unknownIds) blockers.push({ code: "unknown-citation-token", severity: "blocker", message: `引用 token ${id} 不属于当前项目。`, sectionId: section.id, workId: id });
    if (result.unresolvedTokens) blockers.push({ code: "unresolved-citation-token", severity: "blocker", message: "正文存在未解析引用 token。", sectionId: section.id });
    const tokenIds = new Set(result.citedWorkIds);
    for (const id of section.citationIds) { const work = works.get(id); if (!work) blockers.push({ code: "missing-work", severity: "blocker", message: `章节引用了不存在的 Work ${id}。`, sectionId: section.id, workId: id }); else if (work.bibliographicStatus !== "verified") blockers.push({ code: "work-not-verified", severity: "blocker", message: `Work ${id} 尚未完成书目核验。`, sectionId: section.id, workId: id }); else if (work.retractionStatus === "retracted") blockers.push({ code: "retracted-work", severity: "blocker", message: `Work ${id} 已撤稿。`, sectionId: section.id, workId: id }); else if (work.retractionStatus === "corrected") warnings.push({ code: "corrected-work", severity: "warning", message: `Work ${id} 存在更正记录，正式使用前必须阅读更正内容。`, sectionId: section.id, workId: id });
      if (!tokenIds.has(id)) (formal ? blockers : warnings).push({ code: "reference-not-in-body", severity: formal ? "blocker" : "warning", message: `Work ${id} 出现在章节参考文献记录中，但正文没有对应 citation token。`, sectionId: section.id, workId: id });
    }
    for (const id of tokenIds) if (!section.citationIds.includes(id)) (formal ? blockers : warnings).push({ code: "body-citation-not-in-reference-record", severity: formal ? "blocker" : "warning", message: `正文 citation token ${id} 没有同步到章节 citationIds。`, sectionId: section.id, workId: id });
    for (const evidenceId of section.evidenceExcerptIds) {
      const excerpt = excerpts.find((item) => item.id === evidenceId);
      if (!excerpt) { blockers.push({ code: "missing-evidence-excerpt", severity: "blocker", message: `章节引用了不存在的 EvidenceExcerpt ${evidenceId}。`, sectionId: section.id, evidenceExcerptId: evidenceId }); continue; }
      const work = works.get(excerpt.workId);
      if (!work) { blockers.push({ code: "evidence-work-missing", severity: "blocker", message: `EvidenceExcerpt ${evidenceId} 的 Work 不存在。`, sectionId: section.id, evidenceExcerptId: evidenceId }); continue; }
      if (work.bibliographicStatus !== "verified") blockers.push({ code: "evidence-work-not-verified", severity: "blocker", message: `EvidenceExcerpt ${evidenceId} 绑定的 Work 尚未书目核验。`, sectionId: section.id, workId: work.id, evidenceExcerptId: evidenceId });
      if (work.retractionStatus === "retracted") blockers.push({ code: "evidence-retracted-work", severity: "blocker", message: `EvidenceExcerpt ${evidenceId} 来自已撤稿 Work。`, sectionId: section.id, workId: work.id, evidenceExcerptId: evidenceId });
      if (work.retractionStatus === "corrected") warnings.push({ code: "evidence-corrected-work", severity: "warning", message: `EvidenceExcerpt ${evidenceId} 来自有更正记录的 Work，请核对更正内容。`, sectionId: section.id, workId: work.id, evidenceExcerptId: evidenceId });
      if (!excerpt.page && !excerpt.locator) blockers.push({ code: "evidence-missing-locator", severity: "blocker", message: `EvidenceExcerpt ${evidenceId} 缺少页码或定位信息。`, sectionId: section.id, evidenceExcerptId: evidenceId });
      if (excerpt.fullTextAssetId && excerpt.quote && !fullTextContainsQuote(input.projectId, excerpt.fullTextAssetId, excerpt.quote)) blockers.push({ code: "quote-not-in-full-text", severity: "blocker", message: `EvidenceExcerpt ${evidenceId} 的直接引文不在其本地解析全文中。`, sectionId: section.id, evidenceExcerptId: evidenceId });
      if (formal && effectiveVerificationStatus(excerpt) !== "human_verified") blockers.push({ code: "evidence-not-human-verified", severity: "blocker", message: `正式模式不能使用未由研究者确认的 EvidenceExcerpt ${evidenceId}。`, sectionId: section.id, evidenceExcerptId: evidenceId });
      if (excerpt.supportDirection === "contradicting") warnings.push({ code: "contradicting-evidence", severity: "warning", message: `EvidenceExcerpt ${evidenceId} 是 contradicting，不能作为 supporting 证据。`, sectionId: section.id, evidenceExcerptId: evidenceId });
    }
    for (const unsupported of section.unsupportedStatements) (formal ? blockers : warnings).push({ code: "unsupported-statement", severity: formal ? "blocker" : "warning", message: `章节仍有未支持论断：${unsupported.statement}`, sectionId: section.id });
    for (const gap of section.evidenceGaps ?? []) (formal ? blockers : warnings).push({ code: "evidence-gap", severity: formal ? "blocker" : "warning", message: `章节存在证据缺口：${gap}`, sectionId: section.id });
    if (section.content.trim() && !tokens.length && section.citationIds.length === 0 && /literature|background|introduction|theor/i.test(section.title)) warnings.push({ code: "unstructured-citations", severity: "warning", message: "章节有外部事实风险，但没有结构化引用 token。", sectionId: section.id });
    for (const claimId of section.claimIds) {
      const claim = workspace.claims.find((item) => item.id === claimId); if (!claim) { blockers.push({ code: "missing-claim", severity: "blocker", message: `章节引用了不存在的 Claim ${claimId}。`, sectionId: section.id, claimId }); continue; }
      const linked = excerpts.filter((excerpt) => excerpt.claimId === claimId); if (claim.kind === "已发表事实" && !linked.some((excerpt) => { const status = effectiveVerificationStatus(excerpt); return (!formal || status === "human_verified") && ["supporting", "mixed"].includes(excerpt.supportDirection) && Boolean(excerpt.page || excerpt.locator) && status !== "rejected"; })) blockers.push({ code: "unsupported-published-fact", severity: "blocker", message: `已发表事实 ${claimId} 没有满足当前模式的定位证据。`, sectionId: section.id, claimId });
    }
  }
  const referencedInSections = new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)));
  for (const id of cited) if (!referencedInSections.has(id)) warnings.push({ code: "citation-reference-mismatch", severity: "warning", message: `正文 token 的 Work ${id} 尚未同步到 section.citationIds。`, workId: id });
  const coverage = await compileClaimCoverage({ projectId: input.projectId, documentId: input.documentId, versionId: input.versionId, documentOverride: document, persist: input.persist });
  blockers.push(...coverage.blockers.filter((issue) => !blockers.some((existing) => existing.code === issue.code && existing.sectionId === issue.sectionId && existing.claimId === issue.claimId)));
  warnings.push(...coverage.warnings);
  const report: CitationAuditReport = { id: `citation-audit-${randomUUID()}`, projectId: input.projectId, documentId: input.documentId, versionId: input.versionId ?? document.currentVersionId ?? document.manuscript.version, status: blockers.length ? "blocked" : warnings.length ? "passed_with_warnings" : "passed", blockers, warnings, claimCoverageReportId: coverage.id, checkedAt: new Date().toISOString(), checkerVersion: "citation-audit-v3-claim-coverage" };
  return input.persist === false ? report : saveCitationAudit(report);
}

export function latestAudit(projectId: string, documentId: string) { return latestCitationAudit(projectId, documentId); }

import { createHash } from "node:crypto";
import { getProject } from "./portfolio";
import { getProjectDocument } from "./project-documents";
import { readWorkspace } from "./storage";
import { listCandidateRecords, latestPublicationStatusCheck, saveExportAuditManifest } from "./evidence-store";
import { listEvidenceExcerpts } from "./evidence-excerpts";
import { runCitationAudit } from "./citation-audit";
import { latestConsistencyReview } from "./consistency-review";
import { latestClaimCoverage } from "./claim-coverage";
import type { ExportAuditManifest, FormalExportGateResult } from "./types";

export async function checkFormalExportGate(input: { projectId: string; documentId: string; versionId?: string }): Promise<FormalExportGateResult & { manifest?: ExportAuditManifest }> {
  const project = getProject(input.projectId); const document = getProjectDocument(input.projectId, input.documentId);
  if (!project || !document) return { allowed: false, blockers: [{ code: "scope-not-found", message: "项目或文档不存在。" }], warnings: [], evidenceSummary: { candidateCount: 0, verifiedWorkCount: 0, citedWorkCount: 0, humanVerifiedExcerptCount: 0, coveredClaimCount: 0, unsupportedClaimCount: 0, unknownPublicationStatusCount: 0 } };
  const workspace = await readWorkspace(input.projectId); const excerpts = await listEvidenceExcerpts({ projectId: input.projectId }); const candidates = listCandidateRecords(input.projectId);
  const citedWorkIds = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const citedWorks = workspace.works.filter((work) => citedWorkIds.includes(work.id));
  const humanVerifiedExcerptCount = excerpts.filter((excerpt) => excerpt.verificationStatus === "human_verified").length;
  const blockers: FormalExportGateResult["blockers"] = []; const warnings: FormalExportGateResult["warnings"] = [];
  const audit = await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId: input.versionId ?? document.currentVersionId ?? document.manuscript.version, formal: true });
  const coverage = latestClaimCoverage(input.projectId, input.documentId);
  const consistency = latestConsistencyReview(input.projectId, input.documentId);
  if (document.evidenceMode !== "formal") blockers.push({ code: "evidence-mode-not-formal", message: "当前文档 evidenceMode 不是 formal。" });
  if (!document.currentVersionId || document.currentVersionNumber < 1) blockers.push({ code: "no-document-version", message: "文档没有可审查的全局版本。" });
  if (audit.blockers.length) blockers.push(...audit.blockers.map((item) => ({ code: `citation-audit:${item.code}`, message: item.message, sectionId: item.sectionId, claimId: item.claimId, workId: item.workId })));
  if (!coverage || coverage.versionId !== (input.versionId ?? document.currentVersionId)) blockers.push({ code: "coverage-version-mismatch", message: "Claim Coverage 缺失或没有绑定当前文档版本。" });
  else if (coverage.blockers.length) blockers.push(...coverage.blockers.map((item) => ({ code: `claim-coverage:${item.code}`, message: item.message, sectionId: item.sectionId, claimId: item.claimId })));
  if (!consistency || consistency.versionId !== (input.versionId ?? document.currentVersionId)) blockers.push({ code: "consistency-version-mismatch", message: "ConsistencyReview 缺失或没有绑定当前文档版本。" });
  else if (!["passed", "passed_with_warnings"].includes(consistency.status)) blockers.push({ code: "consistency-not-passed", message: `一致性审查状态为 ${consistency.status}。` });
  if (consistency && consistency.humanApproval !== "approved") blockers.push({ code: "human-approval-required", message: "正式导出需要研究者批准一致性审查。" });
  const requiredSections = document.manuscript.chapters.filter((chapter) => chapter.sections.length > 0);
  for (const chapter of requiredSections) if (chapter.sections.every((section) => !section.content.trim())) blockers.push({ code: "required-section-empty", message: `章节 ${chapter.number} ${chapter.title} 为空。`, sectionId: chapter.id });
  for (const work of citedWorks) {
    const check = latestPublicationStatusCheck(input.projectId, work.id);
    if (!check || check.checkState !== "checked") blockers.push({ code: "publication-status-unchecked", message: `Work ${work.id} 尚未完成发表状态检查。`, workId: work.id });
    else if (["retracted", "expression_of_concern"].includes(check.status)) blockers.push({ code: `publication-${check.status}`, message: `Work ${work.id} 的发表状态为 ${check.status}。`, workId: work.id });
    else if (check.status === "corrected") warnings.push({ code: "publication-corrected", message: `Work ${work.id} 存在更正记录。` });
    else if (check.status === "unknown") warnings.push({ code: "publication-unknown", message: `Work ${work.id} 已检查但状态仍 unknown，需要人工确认。` });
  }
  if (!project.institution.trim() || /待指定|generic/i.test(project.institution)) blockers.push({ code: "institution-profile-missing", message: "目标院校尚未确认，不能作为正式提交版导出。" });
  if (audit.warnings.length) warnings.push(...audit.warnings.map((item) => ({ code: `citation-audit:${item.code}`, message: item.message })));
  const coveredClaimCount = coverage?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => sentence.coverageStatus === "covered").length ?? 0;
  const unsupportedClaimCount = coverage?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => ["unsupported", "unclassified"].includes(sentence.coverageStatus)).length ?? 0;
  const result: FormalExportGateResult & { manifest?: ExportAuditManifest } = { allowed: blockers.length === 0, blockers, warnings, evidenceSummary: { candidateCount: candidates.length, verifiedWorkCount: workspace.works.filter((work) => work.bibliographicStatus === "verified").length, citedWorkCount: citedWorks.length, humanVerifiedExcerptCount, coveredClaimCount, unsupportedClaimCount, unknownPublicationStatusCount: citedWorks.filter((work) => { const check = latestPublicationStatusCheck(input.projectId, work.id); return !check || check.status === "unknown"; }).length } };
  if (result.allowed) {
    const versionId = input.versionId ?? document.currentVersionId!;
    const contentHash = createHash("sha256").update(JSON.stringify(document.manuscript)).digest("hex");
    result.manifest = saveExportAuditManifest({ projectId: input.projectId, documentId: input.documentId, versionId, exportedAt: new Date().toISOString(), citationAuditReportId: audit.id, consistencyReviewReportId: consistency?.id ?? "", claimCoverageReportId: coverage?.id ?? "", humanApproval: { status: consistency?.humanApproval ?? "not_reviewed" }, evidenceSummary: { citedWorks: citedWorks.length, bibliographicallyVerifiedWorks: citedWorks.filter((work) => work.bibliographicStatus === "verified").length, publicationStatusCheckedWorks: citedWorks.filter((work) => latestPublicationStatusCheck(input.projectId, work.id)?.checkState === "checked").length, humanVerifiedExcerpts: humanVerifiedExcerptCount, supportedPublishedFacts: coveredClaimCount, unsupportedPublishedFacts: unsupportedClaimCount }, blockers: 0, warnings: warnings.length, contentHash });
  }
  return result;
}

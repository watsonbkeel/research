import { getProject } from "./portfolio";
import { getProjectDocument, documentForVersion, documentVersionContentHash, documentVersionEvidenceBindingHash, documentVersionProposalInputHash, getDocumentVersion, projectDocumentContentHash } from "./project-documents";
import { readWorkspace } from "./storage";
import { listCandidateRecords, latestPublicationStatusCheck, saveExportAuditManifest, consistencyReviewForVersion, documentApprovalForVersion, publicationStatusOverrideForVersion } from "./evidence-store";
import { listEvidenceExcerpts } from "./evidence-excerpts";
import { runCitationAudit } from "./citation-audit";
import { claimCoverageForVersion } from "./claim-coverage";
import type { ExportAuditManifest, FormalExportGateResult } from "./types";
import { qualityReportForVersion } from "./quality";

export async function checkFormalExportGate(input: { projectId: string; documentId: string; versionId?: string }): Promise<FormalExportGateResult & { manifest?: ExportAuditManifest }> {
  const project = getProject(input.projectId); const document = getProjectDocument(input.projectId, input.documentId);
  if (!project || !document) return { allowed: false, blockers: [{ code: "scope-not-found", message: "项目或文档不存在。" }], warnings: [], evidenceSummary: { candidateCount: 0, verifiedWorkCount: 0, citedWorkCount: 0, humanVerifiedExcerptCount: 0, coveredClaimCount: 0, unsupportedClaimCount: 0, unknownPublicationStatusCount: 0 } };
  const blockers: FormalExportGateResult["blockers"] = []; const warnings: FormalExportGateResult["warnings"] = [];
  if (!input.versionId) blockers.push({ code: "version-required", message: "正式导出必须显式指定不可变 document versionId。" });
  const versionDocument = input.versionId ? documentForVersion(document, input.versionId) : undefined;
  if (input.versionId && !versionDocument) blockers.push({ code: "version-not-found", message: "指定的不可变文档版本不存在。" });
  const snapshot = input.versionId ? getDocumentVersion(input.projectId, input.documentId, input.versionId) : undefined;
  if (snapshot && snapshot.contentHash && documentVersionContentHash(snapshot) !== snapshot.contentHash) blockers.push({ code: "version-hash-invalid", message: "指定文档版本快照的 contentHash 校验失败。" });
  if (snapshot) {
    if (snapshot.lifecycleStatus !== "reviewable") blockers.push({ code: "version-not-reviewable", message: "指定文档版本尚未通过持久化复审，不能正式导出。" });
    if (snapshot.evidenceBindingHash !== documentVersionEvidenceBindingHash(snapshot)) blockers.push({ code: "evidence-binding-hash-invalid", message: "指定文档版本冻结的证据链 hash 校验失败。" });
    if (snapshot.proposalInputHash !== documentVersionProposalInputHash(snapshot)) blockers.push({ code: "proposal-input-hash-invalid", message: "指定文档版本冻结的开题输入 hash 校验失败。" });
  }
  const reviewedDocument = versionDocument ?? document;
  const workspace = snapshot?.workspaceSnapshot ?? await readWorkspace(input.projectId); const excerpts = snapshot?.evidenceExcerptsSnapshot as Awaited<ReturnType<typeof listEvidenceExcerpts>> | undefined ?? await listEvidenceExcerpts({ projectId: input.projectId }); const candidates = listCandidateRecords(input.projectId);
  const citedWorkIds = [...new Set(reviewedDocument.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const citedWorks = workspace.works.filter((work) => citedWorkIds.includes(work.id));
  const humanVerifiedExcerptCount = excerpts.filter((excerpt) => excerpt.verificationStatus === "human_verified").length;
  const audit = await runCitationAudit({ projectId: input.projectId, documentId: input.documentId, versionId: input.versionId, formal: true, documentOverride: input.versionId ? reviewedDocument : undefined });
  if (snapshot && audit.contentHash !== projectDocumentContentHash(reviewedDocument)) blockers.push({ code: "audit-content-hash-mismatch", message: "CitationAudit 未绑定当前指定版本正文 hash。" });
  const coverage = input.versionId && audit.claimCoverageReportId ? claimCoverageForVersion(input.projectId, input.documentId, input.versionId) : undefined;
  const consistency = input.versionId ? consistencyReviewForVersion(input.projectId, input.documentId, input.versionId) : undefined;
  if (reviewedDocument.evidenceMode !== "formal") blockers.push({ code: "evidence-mode-not-formal", message: "当前文档 evidenceMode 不是 formal。" });
  if (!reviewedDocument.currentVersionId || reviewedDocument.currentVersionNumber < 1) blockers.push({ code: "no-document-version", message: "文档没有可审查的全局版本。" });
  if (audit.blockers.length) blockers.push(...audit.blockers.map((item) => ({ code: `citation-audit:${item.code}`, message: item.message, sectionId: item.sectionId, claimId: item.claimId, workId: item.workId })));
  if (!coverage || coverage.versionId !== input.versionId || coverage.contentHash !== audit.contentHash) blockers.push({ code: "coverage-version-mismatch", message: "Claim Coverage 缺失、版本或 contentHash 不匹配指定文档版本。" });
  else if (coverage.blockers.length) blockers.push(...coverage.blockers.map((item) => ({ code: `claim-coverage:${item.code}`, message: item.message, sectionId: item.sectionId, claimId: item.claimId })));
  if (!consistency || consistency.versionId !== input.versionId || (consistency.contentHash && consistency.contentHash !== audit.contentHash)) blockers.push({ code: "consistency-version-mismatch", message: "ConsistencyReview 缺失、版本或 contentHash 不匹配指定文档版本。" });
  else if (!["passed", "passed_with_warnings"].includes(consistency.status)) blockers.push({ code: "consistency-not-passed", message: `一致性审查状态为 ${consistency.status}。` });
  const approval = input.versionId ? documentApprovalForVersion(input.projectId, input.documentId, input.versionId) : undefined;
  if (!approval || approval.decision !== "approved" || !approval.reviewer.trim() || !approval.reviewedAt) blockers.push({ code: "human-approval-required", message: "正式导出需要精确绑定该版本、含 reviewer 和 reviewedAt 的独立人工批准。" });
  else if (!snapshot || approval.contentHash !== snapshot.contentHash || approval.evidenceBindingHash !== snapshot.evidenceBindingHash || approval.proposalInputHash !== snapshot.proposalInputHash) blockers.push({ code: "approval-hash-mismatch", message: "HumanApproval 未绑定指定版本当前的 content/evidence/proposal hash。" });
  const quality = input.versionId ? qualityReportForVersion(input.projectId, input.documentId, input.versionId) : undefined;
  if (!quality || quality.documentVersionId !== input.versionId || quality.contentHash !== snapshot?.contentHash) blockers.push({ code: "quality-report-version-mismatch", message: "缺少与指定版本及 contentHash 精确匹配的 QualityReport。" });
  else if (quality.errors.length) blockers.push({ code: "quality-report-errors", message: `QualityReport 仍有 ${quality.errors.length} 个 error。` });
  const requiredSections = reviewedDocument.manuscript.chapters.filter((chapter) => chapter.sections.length > 0);
  for (const chapter of requiredSections) if (chapter.sections.every((section) => !section.content.trim())) blockers.push({ code: "required-section-empty", message: `章节 ${chapter.number} ${chapter.title} 为空。`, sectionId: chapter.id });
  for (const work of citedWorks) {
    const check = snapshot?.publicationStatusSnapshot?.filter((item) => item.workId === work.id).at(-1) ?? latestPublicationStatusCheck(input.projectId, work.id);
    if (!check || check.checkState !== "checked") blockers.push({ code: "publication-status-unchecked", message: `Work ${work.id} 尚未完成发表状态检查。`, workId: work.id });
    else if (["retracted", "expression_of_concern"].includes(check.status)) blockers.push({ code: `publication-${check.status}`, message: `Work ${work.id} 的发表状态为 ${check.status}。`, workId: work.id });
    else if (check.status === "corrected") warnings.push({ code: "publication-corrected", message: `Work ${work.id} 存在更正记录。` });
    else if (check.status === "unknown" && (!input.versionId || !publicationStatusOverrideForVersion(input.projectId, work.id, input.versionId))) blockers.push({ code: "publication-unknown", message: `Work ${work.id} 的发表状态为 checked+unknown，必须有该版本人工确认。`, workId: work.id });
  }
  if (!project.institution.trim() || /待指定|generic/i.test(project.institution)) blockers.push({ code: "institution-profile-missing", message: "目标院校尚未确认，不能作为正式提交版导出。" });
  if (audit.warnings.length) warnings.push(...audit.warnings.map((item) => ({ code: `citation-audit:${item.code}`, message: item.message })));
  const coveredClaimCount = coverage?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => sentence.coverageStatus === "covered").length ?? 0;
  const unsupportedClaimCount = coverage?.paragraphs.flatMap((paragraph) => paragraph.sentences).filter((sentence) => ["unsupported", "unclassified"].includes(sentence.coverageStatus)).length ?? 0;
  const statusFor = (workId: string) => snapshot?.publicationStatusSnapshot?.filter((item) => item.workId === workId).at(-1) ?? latestPublicationStatusCheck(input.projectId, workId); const result: FormalExportGateResult & { manifest?: ExportAuditManifest } = { allowed: blockers.length === 0, blockers, warnings, evidenceSummary: { candidateCount: candidates.length, verifiedWorkCount: workspace.works.filter((work) => work.bibliographicStatus === "verified").length, citedWorkCount: citedWorks.length, humanVerifiedExcerptCount, coveredClaimCount, unsupportedClaimCount, unknownPublicationStatusCount: citedWorks.filter((work) => { const check = statusFor(work.id); return !check || check.status === "unknown"; }).length } };
  if (result.allowed) {
    const versionId = input.versionId ?? document.currentVersionId!;
    const contentHash = projectDocumentContentHash(reviewedDocument);
    result.manifest = saveExportAuditManifest({ projectId: input.projectId, documentId: input.documentId, versionId, exportedAt: new Date().toISOString(), citationAuditReportId: audit.id, consistencyReviewReportId: consistency?.id ?? "", claimCoverageReportId: coverage?.id ?? "", humanApproval: { status: approval?.decision ?? "not_reviewed", reviewer: approval?.reviewer, reviewedAt: approval?.reviewedAt }, evidenceSummary: { citedWorks: citedWorks.length, bibliographicallyVerifiedWorks: citedWorks.filter((work) => work.bibliographicStatus === "verified").length, publicationStatusCheckedWorks: citedWorks.filter((work) => statusFor(work.id)?.checkState === "checked").length, humanVerifiedExcerpts: humanVerifiedExcerptCount, supportedPublishedFacts: coveredClaimCount, unsupportedPublishedFacts: unsupportedClaimCount }, blockers: 0, warnings: warnings.length, contentHash });
  }
  return result;
}

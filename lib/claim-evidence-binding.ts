import { randomUUID } from "node:crypto";
import { claimCoverageForVersion } from "./claim-coverage";
import { listEvidenceExcerpts, effectiveVerificationStatus } from "./evidence-excerpts";
import { claimEvidenceCitationBindingsForVersion, saveClaimEvidenceCitationBinding } from "./evidence-store";
import { getDocumentVersion, refreshDocumentVersionEvidenceSnapshot } from "./project-documents";
import { readWorkspace } from "./storage";
import type { ClaimEvidenceCitationBinding } from "./types";

export async function createClaimEvidenceCitationBinding(input: Omit<ClaimEvidenceCitationBinding, "id" | "createdAt"> & Partial<Pick<ClaimEvidenceCitationBinding, "id" | "createdAt">>) {
  const version = getDocumentVersion(input.projectId, input.documentId, input.documentVersionId); if (!version) throw new Error("DocumentVersion 不存在或不属于当前项目文档。");
  const section = version.sections.find((item) => item.sectionId === input.sectionId); if (!section) throw new Error("Binding.sectionId 不存在于指定版本。");
  if (!section.claimIds.includes(input.claimId)) throw new Error("Binding.claimId 不属于指定版本章节。");
  const coverage = claimCoverageForVersion(input.projectId, input.documentId, input.documentVersionId); if (!coverage || coverage.contentHash !== version.contentHash) throw new Error("指定版本缺少 hash 匹配的 ClaimCoverageReport。");
  const sentence = coverage.paragraphs.flatMap((paragraph) => paragraph.sentences).find((item) => item.sentenceId === input.sentenceId); if (!sentence) throw new Error("Binding.sentenceId 不存在于指定版本 Coverage。");
  if (!sentence.claimIds?.includes(input.claimId)) throw new Error("Binding Claim 与 sentence 的 Claim span 不匹配。");
  const citationIndex = sentence.citationItemIds?.indexOf(input.citationItemId) ?? -1; if (citationIndex < 0 || sentence.citationWorkIds[citationIndex] !== input.workId) throw new Error("Binding CitationItem 与 Work 不匹配。");
  const workspace = await readWorkspace(input.projectId); const claim = workspace.claims.find((item) => item.id === input.claimId); const work = workspace.works.find((item) => item.id === input.workId);
  if (!claim || !work) throw new Error("Claim 或 Work 不属于当前项目。");
  if (work.bibliographicStatus !== "verified") throw new Error("Work 未完成书目核验。");
  const excerpt = (await listEvidenceExcerpts({ projectId: input.projectId, id: input.evidenceExcerptId }))[0];
  if (!excerpt || excerpt.claimId !== input.claimId) throw new Error("EvidenceExcerpt 不属于 Binding.claimId。");
  if (excerpt.workId !== input.workId) throw new Error("EvidenceExcerpt.workId 与 Binding.workId 不匹配。");
  if (effectiveVerificationStatus(excerpt) === "rejected") throw new Error("已拒绝或失效的 EvidenceExcerpt 不能绑定。");
  if (input.relation === "supports" && excerpt.supportDirection === "contradicting") throw new Error("Contradicting excerpt 不能声明为 supports。");
  const binding = saveClaimEvidenceCitationBinding({ ...input, id: input.id ?? `binding-${randomUUID()}`, createdAt: input.createdAt ?? new Date().toISOString() });
  refreshDocumentVersionEvidenceSnapshot(input.projectId, input.documentId, input.documentVersionId);
  return binding;
}

export { claimEvidenceCitationBindingsForVersion };

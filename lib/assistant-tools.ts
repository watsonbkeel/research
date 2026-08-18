import { getProject } from "./portfolio";
import { getProjectDocument } from "./project-documents";
import { readWorkspace } from "./storage";
import { listEvidenceExcerpts } from "./evidence-excerpts";
import { latestAudit } from "./citation-audit";
import { latestConsistencyReview } from "./consistency-review";

export async function getProjectSnapshot(projectId: string) {
  const project = getProject(projectId); if (!project) throw new Error("项目不存在。"); const workspace = await readWorkspace(projectId); const evidence = await listEvidenceExcerpts({ projectId });
  return { project, workspace: { title: workspace.project.titleEn, works: workspace.works.length, claims: workspace.claims.length, experiments: workspace.experiments.length }, evidence: { total: evidence.length, humanVerified: evidence.filter((item) => item.verificationStatus === "human_verified" || (item.verificationStatus === "claim_verified" && item.reviewer && (item.reviewedAt ?? item.reviewDate))).length }, audits: [] };
}

export async function getCurrentDocument(projectId: string, documentId?: string) { const documents = (await import("./project-documents")).listProjectDocuments(projectId); const document = documentId ? documents.find((item) => item.id === documentId) : documents[0]; return document ? { id: document.id, title: document.title, mode: document.mode, status: document.status, chapters: document.manuscript.chapters.map((chapter) => ({ id: chapter.id, number: chapter.number, title: chapter.title, sections: chapter.sections.map((section) => ({ id: section.id, number: section.number, title: section.title, citationCount: section.citationIds.length, unsupportedCount: section.unsupportedStatements.length, words: section.content.split(/\s+/).filter(Boolean).length })) })) } : undefined; }

export async function getQualityBlockers(projectId: string, documentId?: string) { const document = documentId ? getProjectDocument(projectId, documentId) : (await import("./project-documents")).listProjectDocuments(projectId)[0]; return { citationAudit: document ? latestAudit(projectId, document.id) : undefined, consistencyReview: document ? latestConsistencyReview(projectId, document.id) : undefined }; }

export async function listUnsupportedClaims(projectId: string, documentId: string) { const document = getProjectDocument(projectId, documentId); if (!document) throw new Error("文档不存在。"); return document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.unsupportedStatements.map((item) => ({ ...item, sectionId: section.id, sectionTitle: section.title })))); }

export async function listCitedWorks(projectId: string, documentId: string) {
  const document = getProjectDocument(projectId, documentId); if (!document) throw new Error("文档不存在。");
  const workspace = await readWorkspace(projectId); const ids = new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)));
  return workspace.works.filter((work) => ids.has(work.id)).map((work) => ({ ...work, bibliographicStatus: work.bibliographicStatus ?? "unverified" }));
}

export async function listEvidenceForClaim(projectId: string, claimId: string) {
  const workspace = await readWorkspace(projectId); if (!workspace.claims.some((claim) => claim.id === claimId)) throw new Error("Claim不存在或不属于当前项目。");
  return listEvidenceExcerpts({ projectId, claimId });
}

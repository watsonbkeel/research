import { randomUUID } from "node:crypto";
import { readWorkspace } from "./storage";
import { listEvidenceExcerpts, effectiveVerificationStatus } from "./evidence-excerpts";
import { ensureEvidenceSchema } from "./evidence-store";
import { getProjectDocument } from "./project-documents";
import type { SectionEvidenceBundle, Work } from "./types";

export async function buildSectionEvidenceBundle(input: { projectId: string; documentId: string; sectionId: string; mode?: "exploratory" | "formal" }) {
  ensureEvidenceSchema();
  const workspace = await readWorkspace(input.projectId); const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。");
  const section = document.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === input.sectionId); if (!section) throw new Error("章节不存在。");
  const mode = input.mode ?? document.evidenceMode; const excerpts = await listEvidenceExcerpts({ projectId: input.projectId }); const works = new Map(workspace.works.map((work) => [work.id, work]));
  const claimIds = new Set(section.claimIds); const contentCited = section.citationIds; const claims = workspace.claims.filter((claim) => claimIds.has(claim.id)).map((claim) => {
    const evidence = excerpts.filter((excerpt) => excerpt.claimId === claim.id && effectiveVerificationStatus(excerpt) !== "rejected").map((excerpt) => { const work = works.get(excerpt.workId); if (!work || work.bibliographicStatus !== "verified" || work.retractionStatus === "retracted") return undefined; return { evidenceExcerptId: excerpt.id, workId: work.id, authors: work.authors, year: work.year, title: work.title, venue: work.venue, doi: work.doi, quote: excerpt.quote, paraphrase: excerpt.paraphrase, locator: excerpt.page ?? excerpt.locator, supportDirection: excerpt.supportDirection, strength: excerpt.strength, verificationStatus: effectiveVerificationStatus(excerpt), reviewer: excerpt.reviewer, reviewedAt: excerpt.reviewDate, externalModelUsePermission: excerpt.externalModelUsePermission ?? "unknown" }; }).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const permitted = mode === "formal" ? evidence.filter((item) => item.verificationStatus === "human_verified") : evidence.filter((item) => ["human_verified", "ai_suggested"].includes(item.verificationStatus));
    return { claimId: claim.id, text: claim.text, kind: claim.kind === "已发表事实" ? "published_fact" as const : claim.kind === "研究者推论" ? "researcher_inference" as const : "planned_hypothesis" as const, evidence: permitted };
  });
  const unresolvedClaims = workspace.claims.filter((claim) => claimIds.has(claim.id)).flatMap((claim) => {
    const item = claims.find((candidate) => candidate.claimId === claim.id); if (!item?.evidence.length) return [{ claimId: claim.id, reason: "没有当前项目中可用的定位证据。" }];
    if (claim.kind === "已发表事实" && mode === "formal" && !item.evidence.some((evidence) => evidence.verificationStatus === "human_verified" && ["supporting", "mixed"].includes(evidence.supportDirection))) return [{ claimId: claim.id, reason: "正式事实论断没有 human_verified supporting/mixed 证据。" }];
    return [];
  });
  const bundle: SectionEvidenceBundle = { id: `bundle-${randomUUID()}`, projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, mode, claims, unresolvedClaims, createdAt: new Date().toISOString() };
  const db = (await import("./portfolio")).portfolioDatabase(); db.prepare("INSERT INTO section_evidence_bundles VALUES (?,?,?,?,?,?,?)").run(bundle.id, bundle.projectId, bundle.documentId, bundle.sectionId, bundle.mode, JSON.stringify(bundle), bundle.createdAt);
  return { bundle, citedWorkIds: contentCited.filter((id) => works.has(id)), works: [...works.values()] as Work[] };
}

export function bundlePrompt(bundle: SectionEvidenceBundle, options: { allowFullText?: boolean } = {}) {
  return bundle.claims.map((claim) => `${claim.claimId} | ${claim.kind} | ${claim.text}\n${claim.evidence.map((item) => { const canSendText = options.allowFullText === true && item.externalModelUsePermission === "allowed"; return `[${item.evidenceExcerptId}] Work=${item.workId}; ${item.authors} (${item.year}); ${item.title}; ${item.venue ?? ""}; DOI=${item.doi ?? "none"}; locator=${item.locator ?? "missing"}; direction=${item.supportDirection}; strength=${item.strength}; status=${item.verificationStatus}; ${canSendText ? item.quote ?? item.paraphrase ?? "" : "EXCERPT TEXT WITHHELD FROM EXTERNAL MODEL"}`; }).join("\n") || "NO VERIFIED EVIDENCE"}`).join("\n\n");
}

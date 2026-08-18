import type { Claim, Work } from "./types";

export interface ValidationIssue {
  claimId: string;
  severity: "error" | "warning";
  message: string;
}

export function validateClaims(claims: Claim[], works: Work[]): ValidationIssue[] {
  const worksById = new Map(works.map((work) => [work.id, work]));
  const issues: ValidationIssue[] = [];

  for (const claim of claims) {
    const missing = claim.citationIds.filter((id) => !worksById.has(id));
    if (missing.length > 0) {
      issues.push({
        claimId: claim.id,
        severity: "error",
        message: `引用不存在于证据库：${missing.join(", ")}`,
      });
    }

    if (claim.kind === "已发表事实" && claim.citationIds.length === 0) {
      issues.push({
        claimId: claim.id,
        severity: "error",
        message: "已发表事实必须绑定至少一条文献证据。",
      });
    }

    const weakSources = claim.citationIds
      .map((id) => worksById.get(id))
      .filter((work) => work && work.bibliographicStatus !== "verified");
    if (claim.kind === "已发表事实" && weakSources.length > 0) {
      issues.push({
        claimId: claim.id,
        severity: "warning",
        message: "该事实引用的 Work 尚未完成结构化书目核验和论断级证据定位。",
      });
    }
  }

  return issues;
}

export function citationCoverage(claims: Claim[]): number {
  const factualClaims = claims.filter((claim) => claim.kind === "已发表事实");
  if (factualClaims.length === 0) return 100;
  const covered = factualClaims.filter((claim) => claim.citationIds.length > 0).length;
  return Math.round((covered / factualClaims.length) * 100);
}

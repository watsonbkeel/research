import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { createEvidenceExcerpt, updateEvidenceExcerpt } from "@/lib/evidence-excerpts";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

async function verifiedExcerpt() {
  directory = mkdtempSync(path.join(tmpdir(), "evidence-verification-invalidation-"));
  process.env.WORKBENCH_DATA_DIR = directory;
  const project = createProject({ titleEn: "Verification invalidation", titleZh: "核验失效", field: "Methods", context: "Fixture", institution: "University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
  const work = { id: "work-verified", authors: "Author", year: 2026, title: "Verified work", venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "unverified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" };
  registerProjectWork(project.id, work);
  const workspace = await readWorkspace(project.id); workspace.works = [work]; workspace.claims = [{ id: "claim-1", text: "Claim one", kind: "已发表事实", citationIds: [] }]; writeProjectState(project.id, "workspace", workspace);
  updateWorkVerification(project.id, work.id, { id: "verification-verified", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
  const excerpt = await createEvidenceExcerpt({ workId: work.id, locatorType: "page", page: "12", quote: "Exact quote", claimId: "claim-1", reviewer: "Alice", reviewedAt: "2026-08-20T01:00:00.000Z", verificationStatus: "human_verified" }, project.id);
  return { project, excerpt };
}

describe("EvidenceExcerpt human verification invalidation", () => {
  it.each([
    ["quote", { quote: "Changed quote" }],
    ["paraphrase", { paraphrase: "Changed paraphrase" }],
    ["page", { page: "13" }],
    ["locator type", { locatorType: "chapter" as const, locator: "Chapter 3" }],
    ["support direction", { supportDirection: "contradicting" as const }],
    ["claim", { claimId: "claim-2" }],
  ])("invalidates human verification when %s changes", async (_label, patch) => {
    const { project, excerpt } = await verifiedExcerpt();
    const updated = await updateEvidenceExcerpt({ id: excerpt.id, ...patch }, project.id);
    expect(updated.verificationStatus).toBe("unverified");
    expect(updated.reviewer).toBeUndefined();
    expect(updated.reviewedAt).toBeUndefined();
  });

  it("keeps human verification for non-material relevance edits", async () => {
    const { project, excerpt } = await verifiedExcerpt();
    const updated = await updateEvidenceExcerpt({ id: excerpt.id, relevance: "low" }, project.id);
    expect(updated.verificationStatus).toBe("human_verified");
    expect(updated.reviewer).toBe("Alice");
    expect(updated.reviewedAt).toBe("2026-08-20T01:00:00.000Z");
  });
});

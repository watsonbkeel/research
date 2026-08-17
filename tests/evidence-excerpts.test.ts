import { afterEach, describe, expect, it } from "vitest";
import {
  createEvidenceExcerpt,
  deleteEvidenceExcerpt,
  listClaimEvidenceLinks,
  listEvidenceExcerpts,
  updateEvidenceExcerpt,
} from "@/lib/evidence-excerpts";

const createdIds: string[] = [];

afterEach(async () => {
  for (const id of createdIds.splice(0)) {
    try { await deleteEvidenceExcerpt(id); } catch { /* already removed */ }
  }
});

describe("EvidenceExcerpt persistence and claim links", () => {
  it("creates a short quote with rights and verification metadata", async () => {
    const excerpt = await createEvidenceExcerpt({
      id: `test-excerpt-${Date.now()}-create`,
      workId: "work-test",
      locator: "Results, paragraph 2",
      page: 4,
      quote: "A short, bounded quotation.",
      claimId: "claim-test",
      supportDirection: "supporting",
      strength: "high",
      relevance: "high",
      reviewer: "Reviewer",
      reviewDate: "2026-08-08",
      verificationStatus: "full_text_verified",
      rightsStatus: "restricted",
      externalModelUsePermission: "prohibited",
      quotationLimit: 100,
      exportPermission: "prohibited",
    });
    createdIds.push(excerpt.id);
    expect(excerpt.page).toBe("4");
    expect(excerpt.externalModelUsePermission).toBe("prohibited");
    expect((await listEvidenceExcerpts({ claimId: "claim-test" })).map((item) => item.id)).toContain(excerpt.id);
    expect(await listClaimEvidenceLinks("claim-test")).toEqual([{ id: `claim-test:${excerpt.id}`, claimId: "claim-test", evidenceExcerptId: excerpt.id }]);
  });

  it("updates and persists a paraphrase without sending it to a model", async () => {
    const excerpt = await createEvidenceExcerpt({ id: `test-excerpt-${Date.now()}-update`, workId: "work-test", paraphrase: "Researcher note", rightsStatus: "unknown" });
    createdIds.push(excerpt.id);
    const updated = await updateEvidenceExcerpt({ id: excerpt.id, paraphrase: "Updated researcher note", verificationStatus: "claim_verified" });
    expect(updated.paraphrase).toBe("Updated researcher note");
    expect((await listEvidenceExcerpts({ id: excerpt.id }))[0]?.verificationStatus).toBe("claim_verified");
  });

  it("rejects a record without quote or paraphrase", async () => {
    await expect(createEvidenceExcerpt({ id: `test-excerpt-${Date.now()}-invalid`, workId: "work-test" })).rejects.toThrow("quote或paraphrase");
  });
});

import { describe, expect, it } from "vitest";
import type { Claim, Work } from "@/lib/types";
import { citationCoverage, validateClaims } from "@/lib/validation";

const work: Work = {
  id: "source-1",
  authors: "Researcher, A.",
  year: 2024,
  title: "Verified work",
  venue: "Journal",
  group: "理论来源",
  status: "论断证据已定位",
  relevance: "Test fixture",
};

describe("claim validation", () => {
  it("rejects factual claims without citations", () => {
    const claims: Claim[] = [{ id: "c1", text: "A fact", kind: "已发表事实", citationIds: [] }];
    expect(validateClaims(claims, [work])).toEqual([
      expect.objectContaining({ claimId: "c1", severity: "error" }),
    ]);
    expect(citationCoverage(claims)).toBe(0);
  });

  it("rejects citations outside the evidence library", () => {
    const claims: Claim[] = [{ id: "c1", text: "A fact", kind: "已发表事实", citationIds: ["invented"] }];
    expect(validateClaims(claims, [work])[0].message).toContain("invented");
  });

  it("allows explicitly marked hypotheses without citations", () => {
    const claims: Claim[] = [{ id: "c1", text: "A hypothesis", kind: "待检验假设", citationIds: [] }];
    expect(validateClaims(claims, [work])).toHaveLength(0);
  });

  it("warns when a factual source is only metadata-verified", () => {
    const claims: Claim[] = [{ id: "c1", text: "A fact", kind: "已发表事实", citationIds: ["source-1"] }];
    const metadataOnly = { ...work, status: "DOI已核对" as const };
    expect(validateClaims(claims, [metadataOnly])).toEqual([
      expect.objectContaining({ severity: "warning" }),
    ]);
  });
});

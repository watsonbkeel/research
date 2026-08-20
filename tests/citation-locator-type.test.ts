import { describe, expect, it } from "vitest";
import { hydrateCitationItemsFromBindings } from "@/lib/project-documents";
import type { DocumentVersion } from "@/lib/types";

describe("evidence locator type preservation", () => {
  it.each([
    ["page", "3", "page"],
    ["chapter", "3", "chapter"],
    ["section", "Method", "section"],
    ["paragraph", "5", "paragraph"],
    ["figure", "Figure 2", "figure"],
    ["table", "Table 4", "table"],
  ])("preserves %s locator semantics", (locatorType, locator, expected) => {
    const version = {
      citationItems: [{ id: "citation-1", workId: "work-1" }],
      citationClusters: [{ id: "cluster-1", sectionId: "section-1", sentenceId: "sentence-1", documentOrder: 1, position: 0, mode: "parenthetical", items: [{ id: "citation-1", workId: "work-1" }] }],
      claimEvidenceCitationBindings: [{ id: "binding-1", projectId: "project-1", documentId: "document-1", documentVersionId: "version-1", sectionId: "section-1", sentenceId: "sentence-1", claimId: "claim-1", evidenceExcerptId: "excerpt-1", workId: "work-1", citationItemId: "citation-1", relation: "supports", createdAt: "2026-08-20T00:00:00.000Z" }],
      evidenceExcerptsSnapshot: [{ id: "excerpt-1", workId: "work-1", locatorType, locator, verificationStatus: "human_verified" }],
    } as unknown as DocumentVersion;
    const hydrated = hydrateCitationItemsFromBindings(version);
    expect(hydrated.citationItems?.[0]).toMatchObject({ locatorType: expected, locator });
  });

  it("does not guess a missing locator type", () => {
    const version = {
      citationItems: [{ id: "citation-1", workId: "work-1" }],
      citationClusters: [],
      claimEvidenceCitationBindings: [{ id: "binding-1", projectId: "project-1", documentId: "document-1", documentVersionId: "version-1", sectionId: "section-1", sentenceId: "sentence-1", claimId: "claim-1", evidenceExcerptId: "excerpt-1", workId: "work-1", citationItemId: "citation-1", relation: "supports", createdAt: "2026-08-20T00:00:00.000Z" }],
      evidenceExcerptsSnapshot: [{ id: "excerpt-1", workId: "work-1", locator: "Method", verificationStatus: "human_verified" }],
    } as unknown as DocumentVersion;
    expect(hydrateCitationItemsFromBindings(version).citationItems?.[0]).not.toHaveProperty("locatorType");
  });
});

import { describe, expect, it } from "vitest";
import {
  createEmptyEvidenceExcerptForm,
  evidenceExcerptToForm,
  evidenceFormToInput,
  validateEvidenceExcerptForm,
} from "@/lib/evidence-excerpt-form";

describe("evidence excerpt form adapter", () => {
  it.each([
    ["page", { page: "12", locator: "" }],
    ["chapter", { page: "", locator: "Chapter 3" }],
    ["section", { page: "", locator: "Methods" }],
    ["paragraph", { page: "", locator: "Paragraph 5" }],
    ["figure", { page: "", locator: "Figure 2" }],
    ["table", { page: "", locator: "Table 4" }],
  ] as const)("creates a %s payload with only the applicable location field", (locatorType, location) => {
    const form = { ...createEmptyEvidenceExcerptForm("work-1"), locatorType, ...location, paraphrase: "A bounded note" };
    const input = evidenceFormToInput(form);
    expect(input).toMatchObject({ workId: "work-1", locatorType, paraphrase: "A bounded note" });
    expect(input).not.toHaveProperty("quote");
    if (locatorType === "page") {
      expect(input.page).toBe("12");
      expect(input.locator).toBeUndefined();
    } else {
      expect(input.locator).toBe(location.locator);
      expect(input.page).toBeUndefined();
    }
  });

  it("validates human verification metadata and converts local time to ISO", () => {
    const form = { ...createEmptyEvidenceExcerptForm(), locatorType: "section" as const, locator: "Methods", quote: "Exact quote", verificationStatus: "human_verified" as const };
    expect(validateEvidenceExcerptForm(form)).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "reviewer" }),
      expect.objectContaining({ field: "reviewedAtLocal" }),
    ]));
    form.reviewer = "Reviewer";
    form.reviewedAtLocal = "2026-08-20T03:04";
    expect(evidenceFormToInput(form).reviewedAt).toBe(new Date(form.reviewedAtLocal).toISOString());
  });

  it("loads and edits a legacy locator without guessing its type", () => {
    const form = evidenceExcerptToForm({ id: "old", workId: "work-1", locator: "Methods", paraphrase: "Note", supportDirection: "supporting", strength: "medium", relevance: "medium", verificationStatus: "unverified", rightsStatus: "unknown", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" });
    expect(form.locator).toBe("Methods");
    expect(form.locatorType).toBeUndefined();
    expect(validateEvidenceExcerptForm(form)).toEqual(expect.arrayContaining([expect.objectContaining({ field: "locatorType" })]));
  });
});

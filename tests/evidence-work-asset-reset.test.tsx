import { describe, expect, it } from "vitest";
import { changeEvidenceWork } from "@/lib/evidence-excerpt-form";
import { createEmptyEvidenceExcerptForm } from "@/lib/evidence-excerpt-form";

describe("EvidenceExcerpt work and full-text asset coupling", () => {
  it("clears the selected full-text asset when Work changes", () => {
    const form = { ...createEmptyEvidenceExcerptForm("work-a"), fullTextAssetId: "asset-a" };
    expect(changeEvidenceWork(form, "work-b")).toMatchObject({ workId: "work-b", fullTextAssetId: "" });
  });
});

import { describe, expect, it } from "vitest";
import { institutionFormToProfile, institutionProfileToForm } from "@/lib/institution-form";
import { createEmptyEvidenceExcerptForm, evidenceFormToInput } from "@/lib/evidence-excerpt-form";

describe("UI formal readiness adapters", () => {
  it("produces backend-shaped institution and typed evidence payloads", () => {
    expect(institutionFormToProfile(institutionProfileToForm({} as never)).requiredSections).toBeDefined();
    const form = { ...createEmptyEvidenceExcerptForm("work-1"), locatorType: "table" as const, locator: "Table 2", paraphrase: "A bounded note" };
    expect(evidenceFormToInput(form)).toMatchObject({ workId: "work-1", locatorType: "table", locator: "Table 2", page: undefined });
  });
});

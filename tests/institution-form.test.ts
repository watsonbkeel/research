import { describe, expect, it } from "vitest";
import {
  institutionFormToProfile,
  institutionProfileToForm,
  normalizeRequiredSectionKey,
  validateInstitutionForm,
} from "@/lib/institution-form";
import type { InstitutionProfile } from "@/lib/institution";

const profile: InstitutionProfile = {
  id: "profile-1",
  university: "Example University",
  faculty: "Graduate Faculty",
  school: "School of Research",
  program: "Doctoral programme",
  milestoneName: "Confirmation",
  requiredSections: [
    "Legacy abstract",
    {
      key: "methods",
      label: "Methods",
      sectionId: "section-methods",
      sectionKey: "methods",
      aliases: ["Methodology"],
      required: true,
      minimumCharacters: 80,
    },
  ],
  wordLimit: 10_000,
  pageLimit: 30,
  oralPresentationRequirements: "Presentation",
  panelComposition: "Panel",
  ethicsPrerequisites: "Ethics",
  dataManagementRequirements: "Data management",
  aiUseRequirements: "AI declaration",
  formattingRequirements: "Formatting",
  officialUrl: "https://example.edu/rules",
  accessDate: "2026-08-20",
  verificationStatus: "verified",
  verifiedBy: "Reviewer",
  verifiedAt: "2026-08-20T02:03:04.000Z",
  sourceNote: "Official handbook",
  notes: "Notes",
};

describe("institution profile form adapter", () => {
  it("converts legacy string and structured required sections without [object Object]", () => {
    const form = institutionProfileToForm(profile);
    expect(form.requiredSections).toHaveLength(2);
    expect(form.requiredSections[0]).toMatchObject({
      label: "Legacy abstract",
      aliasesText: "Legacy abstract",
      required: true,
      sectionId: "",
      sectionKey: "",
      minimumCharacters: "",
    });
    expect(form.requiredSections[1]).toMatchObject({
      key: "methods",
      sectionId: "section-methods",
      sectionKey: "methods",
      aliasesText: "Methodology",
      minimumCharacters: "80",
    });
    expect(JSON.stringify(form)).not.toContain("[object Object]");
  });

  it("round trips structured fields and datetime-local values", () => {
    const form = institutionProfileToForm(profile);
    expect(form.verifiedAtLocal).toBe("2026-08-20T02:03");
    const restored = institutionFormToProfile(form);
    expect(restored).toMatchObject({
      faculty: "Graduate Faculty",
      school: "School of Research",
      verifiedBy: "Reviewer",
      verifiedAt: "2026-08-20T02:03:00.000Z",
      sourceNote: "Official handbook",
    });
    expect(restored.requiredSections).toEqual([
      expect.objectContaining({ label: "Legacy abstract", aliases: ["Legacy abstract"], required: true }),
      expect.objectContaining({ key: "methods", sectionId: "section-methods", sectionKey: "methods", aliases: ["Methodology"], minimumCharacters: 80 }),
    ]);
  });

  it("requires verification metadata and validates minimum characters as a non-negative integer", () => {
    const form = institutionProfileToForm(profile);
    form.verifiedBy = "";
    form.verifiedAtLocal = "";
    form.requiredSections[0].minimumCharacters = "-1";
    const errors = validateInstitutionForm(form);
    expect(errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "verifiedBy" }),
      expect.objectContaining({ field: "verifiedAtLocal" }),
      expect.objectContaining({ field: "requiredSections.0.minimumCharacters" }),
    ]));
  });

  it("creates stable unique keys for new required sections", () => {
    expect(normalizeRequiredSectionKey("Research Context", ["research-context"]))
      .toBe("research-context-2");
  });
});

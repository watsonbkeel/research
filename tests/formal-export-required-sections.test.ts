import { describe, expect, it } from "vitest";
import { validateInstitutionProfileForFormalExport } from "@/lib/institution";

describe("formal institution required sections", () => {
  const sections = [
    { sectionId: "s-abstract", title: "Abstract", content: "A complete abstract." },
    { sectionId: "s-method", title: "Method", content: "" },
    { sectionId: "s-limitations", title: "Limitations", content: "" },
  ];

  const profile = {
    id: "profile-test",
    university: "Verified University",
    faculty: "Research Faculty",
    school: "Research School",
    program: "Doctoral program",
    milestoneName: "Confirmation",
    requiredSections: [
      { key: "abstract", label: "Abstract", sectionId: "s-abstract", required: true },
      { key: "method", label: "Method", sectionId: "s-method", required: true },
      { key: "limitations", label: "Limitations", sectionId: "s-limitations", required: true, minimumCharacters: 20 },
    ],
    wordLimit: null,
    pageLimit: null,
    oralPresentationRequirements: "",
    panelComposition: "",
    ethicsPrerequisites: "",
    dataManagementRequirements: "",
    aiUseRequirements: "",
    formattingRequirements: "",
    officialUrl: "",
    accessDate: "",
    verificationStatus: "verified",
    verifiedBy: "researcher",
    verifiedAt: "2026-08-20T00:00:00.000Z",
    notes: "",
  };

  it("checks every required section independently", () => {
    const blockers = validateInstitutionProfileForFormalExport(profile, sections);
    expect(blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
      "institution-required-section-empty",
      "institution-required-section-below-minimum",
    ]));
    expect(blockers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "institution-required-section-missing" }),
    ]));
  });

  it("blocks an unmapped required section and allows optional empties", () => {
    const blockers = validateInstitutionProfileForFormalExport({
      ...profile,
      requiredSections: [
        { key: "unknown", label: "Unknown", required: true },
        { key: "optional", label: "Optional", required: false },
      ],
    }, sections);
    expect(blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "institution-required-section-unmapped", requiredSectionKey: "unknown" }),
    ]));
    expect(blockers).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ requiredSectionKey: "optional" }),
    ]));
  });
});

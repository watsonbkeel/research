import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { validateInstitutionProfileForFormalExport } from "@/lib/institution";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal, saveInstitutionProfileWithDocumentSnapshots, saveProjectSection } from "@/lib/project-documents";
import { checkFormalExportGate } from "@/lib/formal-export-gate";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

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

  it("passes the required-section check when all three mapped sections contain enough text", () => {
    const complete = sections.map((section) => ({ ...section, content: section.sectionId === "s-limitations" ? "A sufficiently detailed limitations section." : "Complete." }));
    expect(validateInstitutionProfileForFormalExport(profile, complete).filter((item) => item.code.startsWith("institution-required-section-"))).toEqual([]);
  });

  it("distinguishes a missing explicit sectionId and a non-empty below-minimum section", () => {
    const blockers = validateInstitutionProfileForFormalExport({ ...profile, requiredSections: [
      { key: "missing", label: "Missing", sectionId: "not-present", required: true },
      { key: "method", label: "Method", sectionId: "s-method", required: true, minimumCharacters: 20 },
    ] }, sections.map((section) => section.sectionId === "s-method" ? { ...section, content: "Short" } : section));
    expect(blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "institution-required-section-missing", mappedSectionId: "not-present" }),
      expect.objectContaining({ code: "institution-required-section-below-minimum", currentCharacters: 5, minimumCharacters: 20 }),
    ]));
  });

  it("uses frozen version sections when current content is later completed", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "required-section-version-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Required section version fixture", titleZh: "必填项版本测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id); const section = document.manuscript.chapters[0].sections[0];
    const snapshotted = saveInstitutionProfileWithDocumentSnapshots(project.id, { ...profile, requiredSections: [{ key: "abstract", label: section.title, sectionId: section.id, required: true }] });
    const frozenEmptyVersion = snapshotted.documentVersions.find((item) => item.documentId === document.id)!;
    const filled = saveProjectSection({ projectId: project.id, documentId: document.id, sectionId: section.id, content: "The current document is now complete.", changeSummary: "complete required item", editor: "researcher" });
    const oldGate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: frozenEmptyVersion.id });
    const newGate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: filled.documentVersion.id });
    expect(oldGate.blockers.map((item) => item.code)).toContain("institution-required-section-empty");
    expect(newGate.blockers.map((item) => item.code)).not.toContain("institution-required-section-empty");
  });
});

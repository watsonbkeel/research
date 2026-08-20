import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { validateInstitutionProfileForFormalExport } from "@/lib/institution";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal, saveInstitutionProfileWithDocumentSnapshots } from "@/lib/project-documents";
import { checkFormalExportGate } from "@/lib/formal-export-gate";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

const baseProfile = {
  id: "profile-status",
  university: "Verified University",
  faculty: "Research Faculty",
  school: "Research School",
  program: "Doctoral program",
  milestoneName: "Confirmation",
  requiredSections: [],
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
  notes: "",
};

describe("formal institution profile verification", () => {
  it.each([
    ["missing", undefined, undefined],
    ["unverified", "unverified", undefined],
    ["missing verifier", "verified", undefined],
    ["missing verification time", "verified", "researcher"],
  ])("blocks %s profile state", (_label, status, verifiedBy) => {
    const blockers = validateInstitutionProfileForFormalExport({
      ...baseProfile,
      ...(status ? { verificationStatus: status } : {}),
      ...(verifiedBy ? { verifiedBy } : {}),
    }, []);
    expect(blockers.length).toBeGreaterThan(0);
    expect(blockers.map((item) => item.code)).toEqual(expect.arrayContaining([
      status === "verified" && verifiedBy ? "institution-profile-verification-time-missing" : status === "verified" ? "institution-profile-verifier-missing" : status ? "institution-profile-unverified" : "institution-profile-missing",
    ]));
  });

  it("accepts a fully verified profile", () => {
    expect(validateInstitutionProfileForFormalExport({
      ...baseProfile,
      verificationStatus: "verified",
      verifiedBy: "researcher",
      verifiedAt: "2026-08-20T00:00:00.000Z",
    }, [])).toEqual([]);
  });

  it("does not let a newly verified current profile make an old version pass", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "institution-profile-version-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Institution version fixture", titleZh: "院校版本测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id); const oldVersionId = document.currentVersionId!;
    const saved = saveInstitutionProfileWithDocumentSnapshots(project.id, { ...baseProfile, verificationStatus: "verified", verifiedBy: "researcher", verifiedAt: "2026-08-20T00:00:00.000Z" });
    const newVersion = saved.documentVersions.find((item) => item.documentId === document.id)!;
    const oldGate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: oldVersionId });
    const newGate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: newVersion.id });
    expect(oldGate.blockers.map((item) => item.code)).toContain("institution-profile-unverified");
    expect(newGate.blockers.map((item) => item.code)).not.toEqual(expect.arrayContaining(["institution-profile-unverified", "institution-profile-verifier-missing", "institution-profile-verification-time-missing"]));
    expect(newVersion.parentVersionId).toBe(oldVersionId);
  });
});

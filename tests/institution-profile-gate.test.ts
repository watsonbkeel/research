import { describe, expect, it } from "vitest";
import { validateInstitutionProfileForFormalExport } from "@/lib/institution";

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
});

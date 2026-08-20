import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

export const institutionRequiredSectionSchema = z.object({
  key: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1).max(240),
  sectionId: z.string().trim().min(1).max(240).optional(),
  sectionKey: z.string().trim().min(1).max(240).optional(),
  aliases: z.array(z.string().trim().min(1).max(240)).max(40).optional(),
  required: z.boolean(),
  minimumCharacters: z.number().int().min(0).max(500_000).optional(),
}).strict();

export type InstitutionRequiredSection = z.infer<typeof institutionRequiredSectionSchema>;

export const institutionProfileSchema = z.object({
  id: z.string().min(1).max(100),
  university: z.string().max(240),
  faculty: z.string().max(240),
  school: z.string().max(240),
  program: z.string().max(240),
  milestoneName: z.string().max(240),
  requiredSections: z.array(z.union([z.string().trim().min(1).max(240), institutionRequiredSectionSchema])).max(100),
  wordLimit: z.number().int().min(0).max(500_000).nullable(),
  pageLimit: z.number().int().min(0).max(10_000).nullable(),
  oralPresentationRequirements: z.string().max(4000),
  panelComposition: z.string().max(2000),
  ethicsPrerequisites: z.string().max(4000),
  dataManagementRequirements: z.string().max(4000),
  aiUseRequirements: z.string().max(4000),
  formattingRequirements: z.string().max(4000),
  officialUrl: z.string().url().or(z.literal("")),
  accessDate: z.string().max(40),
  verificationStatus: z.enum(["generic-baseline", "pending-verification", "unverified", "draft", "imported", "requires_review", "unknown", "verified"]),
  verifiedBy: z.string().trim().min(1).max(240).optional(),
  verifiedAt: z.string().datetime().optional(),
  sourceNote: z.string().max(2000).optional(),
  notes: z.string().max(4000),
});

export type InstitutionProfile = z.infer<typeof institutionProfileSchema>;

export type InstitutionGateBlocker = {
  code: string;
  message: string;
  sectionId?: string;
  requiredSectionKey?: string;
  label?: string;
  mappedSectionId?: string;
  currentCharacters?: number;
  minimumCharacters?: number;
};

type InstitutionSectionSnapshot = { sectionId: string; sectionKey?: string; title: string; content: string };

function normalizedSectionName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[，。；：！？、,.!?:;()[\]{}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizedRequiredSection(value: string | InstitutionRequiredSection): InstitutionRequiredSection {
  if (typeof value !== "string") return value;
  return { key: normalizedSectionName(value).replace(/\s+/gu, "-"), label: value, aliases: [value], required: true };
}

export function validateInstitutionProfileForFormalExport(profileInput: unknown, sections: InstitutionSectionSnapshot[]): InstitutionGateBlocker[] {
  const parsed = institutionProfileSchema.safeParse(profileInput);
  if (!parsed.success) return [{ code: "institution-profile-missing", message: "DocumentVersion 缺少可读取的院校模板快照。" }];
  const profile = parsed.data;
  const blockers: InstitutionGateBlocker[] = [];
  if (profile.verificationStatus !== "verified") {
    blockers.push({ code: "institution-profile-unverified", message: `院校模板核验状态为 ${profile.verificationStatus}，必须明确 verified。` });
  } else {
    if (!profile.verifiedBy?.trim()) blockers.push({ code: "institution-profile-verifier-missing", message: "verified 院校模板缺少 verifiedBy。" });
    if (!profile.verifiedAt) blockers.push({ code: "institution-profile-verification-time-missing", message: "verified 院校模板缺少 verifiedAt。" });
  }

  for (const rawRequired of profile.requiredSections) {
    const required = normalizedRequiredSection(rawRequired);
    if (!required.required) continue;
    let mapped: InstitutionSectionSnapshot | undefined;
    if (required.sectionId) {
      mapped = sections.find((section) => section.sectionId === required.sectionId);
      if (!mapped) {
        blockers.push({ code: "institution-required-section-missing", message: `必填项 ${required.label} 指定的 sectionId 不存在。`, requiredSectionKey: required.key, label: required.label, mappedSectionId: required.sectionId, currentCharacters: 0, minimumCharacters: required.minimumCharacters });
        continue;
      }
    } else if (required.sectionKey) {
      mapped = sections.find((section) => section.sectionKey === required.sectionKey);
    } else {
      const accepted = new Set([required.label, ...(required.aliases ?? [])].map(normalizedSectionName));
      mapped = sections.find((section) => accepted.has(normalizedSectionName(section.title)));
    }
    if (!mapped) {
      blockers.push({ code: "institution-required-section-unmapped", message: `必填项 ${required.label} 无法精确映射到版本章节。`, requiredSectionKey: required.key, label: required.label, currentCharacters: 0, minimumCharacters: required.minimumCharacters });
      continue;
    }
    const currentCharacters = mapped.content.trim().length;
    const details = { requiredSectionKey: required.key, label: required.label, sectionId: mapped.sectionId, mappedSectionId: mapped.sectionId, currentCharacters, minimumCharacters: required.minimumCharacters };
    if (currentCharacters === 0) blockers.push({ code: "institution-required-section-empty", message: `必填项 ${required.label} 内容为空。`, ...details });
    if (required.minimumCharacters !== undefined && currentCharacters < required.minimumCharacters) blockers.push({ code: "institution-required-section-below-minimum", message: `必填项 ${required.label} 字符数 ${currentCharacters}，低于模板要求 ${required.minimumCharacters}。`, ...details });
  }
  return blockers;
}

export const genericAustralianBaseline: InstitutionProfile = {
  id: "generic-australian-baseline",
  university: "Generic Australian university baseline",
  faculty: "Not specified",
  school: "Not specified",
  program: "AQF Level 10 doctoral program",
  milestoneName: "Confirmation of candidature",
  requiredSections: [
    "Title page", "Abstract", "Research context and significance", "Critical literature review",
    "Theoretical framework", "Research questions and hypotheses", "Methodology", "Ethics and data management",
    "Feasibility and timeline", "Expected contributions", "Limitations", "References", "Appendices",
  ],
  wordLimit: null,
  pageLimit: null,
  oralPresentationRequirements: "Institution-specific oral presentation requirements must be confirmed from the official source.",
  panelComposition: "Institution-specific panel composition must be confirmed from the official source.",
  ethicsPrerequisites: "Confirm the applicable human research ethics pathway before recruitment or data collection.",
  dataManagementRequirements: "Document consent, de-identification, storage location, retention and destruction procedures.",
  aiUseRequirements: "Declare AI assistance in accordance with the institution's current policy; do not delegate authorship or fabricate evidence.",
  formattingRequirements: "Use the institution's current template after the target university is selected.",
  officialUrl: "",
  accessDate: "",
  verificationStatus: "generic-baseline",
  notes: "This baseline does not claim compliance with any specific Australian university.",
};

export function readInstitutionProfile(projectId?: string): InstitutionProfile {
  const stored = readWorkspaceState<unknown>("institution_profile", projectId);
  const parsed = institutionProfileSchema.safeParse(stored);
  return parsed.success ? parsed.data : genericAustralianBaseline;
}

export function saveInstitutionProfile(input: InstitutionProfile, projectId?: string): InstitutionProfile {
  const profile = institutionProfileSchema.parse(input);
  writeWorkspaceState("institution_profile", profile, projectId);
  return profile;
}

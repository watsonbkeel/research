import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

export const institutionProfileSchema = z.object({
  id: z.string().min(1).max(100),
  university: z.string().max(240),
  faculty: z.string().max(240),
  school: z.string().max(240),
  program: z.string().max(240),
  milestoneName: z.string().max(240),
  requiredSections: z.array(z.string().min(1).max(240)).max(100),
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
  verificationStatus: z.enum(["generic-baseline", "pending-verification", "verified"]),
  notes: z.string().max(4000),
});

export type InstitutionProfile = z.infer<typeof institutionProfileSchema>;

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

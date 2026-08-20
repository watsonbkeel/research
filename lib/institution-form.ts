import type {
  InstitutionProfile,
  InstitutionRequiredSection,
} from "./institution";

export interface InstitutionRequiredSectionForm {
  key: string;
  label: string;
  sectionId: string;
  sectionKey: string;
  aliasesText: string;
  required: boolean;
  minimumCharacters: string;
}

export interface InstitutionProfileForm {
  id: string;
  university: string;
  faculty: string;
  school: string;
  program: string;
  milestoneName: string;
  requiredSections: InstitutionRequiredSectionForm[];
  wordLimit: string;
  pageLimit: string;
  oralPresentationRequirements: string;
  panelComposition: string;
  ethicsPrerequisites: string;
  dataManagementRequirements: string;
  aiUseRequirements: string;
  formattingRequirements: string;
  officialUrl: string;
  accessDate: string;
  verificationStatus: InstitutionProfile["verificationStatus"];
  verifiedBy: string;
  verifiedAtLocal: string;
  sourceNote: string;
  notes: string;
}

export interface InstitutionFormError {
  field: string;
  message: string;
}

function localDateTimeFromIso(value: string | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

function sectionFormFromValue(
  value: string | InstitutionRequiredSection,
  existingKeys: string[],
): InstitutionRequiredSectionForm {
  if (typeof value === "string") {
    const label = value.trim();
    return {
      key: normalizeRequiredSectionKey(label, existingKeys),
      label,
      sectionId: "",
      sectionKey: "",
      aliasesText: label,
      required: true,
      minimumCharacters: "",
    };
  }
  return {
    key: value.key,
    label: value.label,
    sectionId: value.sectionId ?? "",
    sectionKey: value.sectionKey ?? "",
    aliasesText: (value.aliases ?? []).join("\n"),
    required: value.required,
    minimumCharacters: value.minimumCharacters === undefined ? "" : String(value.minimumCharacters),
  };
}

export function normalizeRequiredSectionKey(label: string, existingKeys: string[]) {
  const base = label
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "") || "required-section";
  const used = new Set(existingKeys.map((key) => key.trim()).filter(Boolean));
  if (!used.has(base)) return base;
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function institutionProfileToForm(profile: InstitutionProfile): InstitutionProfileForm {
  const keys: string[] = [];
  const requiredSections = profile.requiredSections.map((value) => {
    const row = sectionFormFromValue(value, keys);
    keys.push(row.key);
    return row;
  });
  return {
    id: profile.id,
    university: profile.university,
    faculty: profile.faculty,
    school: profile.school,
    program: profile.program,
    milestoneName: profile.milestoneName,
    requiredSections,
    wordLimit: profile.wordLimit == null ? "" : String(profile.wordLimit),
    pageLimit: profile.pageLimit == null ? "" : String(profile.pageLimit),
    oralPresentationRequirements: profile.oralPresentationRequirements,
    panelComposition: profile.panelComposition,
    ethicsPrerequisites: profile.ethicsPrerequisites,
    dataManagementRequirements: profile.dataManagementRequirements,
    aiUseRequirements: profile.aiUseRequirements,
    formattingRequirements: profile.formattingRequirements,
    officialUrl: profile.officialUrl,
    accessDate: profile.accessDate,
    verificationStatus: profile.verificationStatus,
    verifiedBy: profile.verifiedBy ?? "",
    verifiedAtLocal: localDateTimeFromIso(profile.verifiedAt),
    sourceNote: profile.sourceNote ?? "",
    notes: profile.notes,
  };
}

function numericLimit(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`${field}必须是非负整数。`);
  return parsed;
}

export function institutionFormToProfile(form: InstitutionProfileForm): InstitutionProfile {
  const requiredSections: InstitutionRequiredSection[] = form.requiredSections.map((row) => {
    const minimumCharacters = row.minimumCharacters.trim() ? Number(row.minimumCharacters.trim()) : undefined;
    const aliases = row.aliasesText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    return {
      key: row.key.trim(),
      label: row.label.trim(),
      ...(row.sectionId.trim() ? { sectionId: row.sectionId.trim() } : {}),
      ...(row.sectionKey.trim() ? { sectionKey: row.sectionKey.trim() } : {}),
      ...(aliases.length ? { aliases } : {}),
      required: row.required,
      ...(minimumCharacters === undefined ? {} : { minimumCharacters }),
    };
  });
  const verifiedAt = form.verifiedAtLocal.trim() ? new Date(form.verifiedAtLocal).toISOString() : undefined;
  return {
    id: form.id,
    university: form.university.trim(),
    faculty: form.faculty.trim(),
    school: form.school.trim(),
    program: form.program.trim(),
    milestoneName: form.milestoneName.trim(),
    requiredSections,
    wordLimit: numericLimit(form.wordLimit, "wordLimit"),
    pageLimit: numericLimit(form.pageLimit, "pageLimit"),
    oralPresentationRequirements: form.oralPresentationRequirements.trim(),
    panelComposition: form.panelComposition.trim(),
    ethicsPrerequisites: form.ethicsPrerequisites.trim(),
    dataManagementRequirements: form.dataManagementRequirements.trim(),
    aiUseRequirements: form.aiUseRequirements.trim(),
    formattingRequirements: form.formattingRequirements.trim(),
    officialUrl: form.officialUrl.trim(),
    accessDate: form.accessDate.trim(),
    verificationStatus: form.verificationStatus,
    ...(form.verifiedBy.trim() ? { verifiedBy: form.verifiedBy.trim() } : {}),
    ...(verifiedAt ? { verifiedAt } : {}),
    ...(form.sourceNote.trim() ? { sourceNote: form.sourceNote.trim() } : {}),
    notes: form.notes.trim(),
  };
}

export function validateInstitutionForm(form: InstitutionProfileForm): InstitutionFormError[] {
  const errors: InstitutionFormError[] = [];
  if (!form.university.trim()) errors.push({ field: "university", message: "请填写 University。" });
  if (!form.program.trim()) errors.push({ field: "program", message: "请填写 Program。" });
  if (form.verifiedAtLocal.trim() && Number.isNaN(new Date(form.verifiedAtLocal).getTime())) errors.push({ field: "verifiedAtLocal", message: "核验时间格式无效。" });
  if (form.verificationStatus === "verified") {
    if (!form.verifiedBy.trim()) errors.push({ field: "verifiedBy", message: "verified 状态必须填写核验者。" });
    if (!form.verifiedAtLocal.trim()) errors.push({ field: "verifiedAtLocal", message: "verified 状态必须填写核验时间。" });
  }
  for (const [index, row] of form.requiredSections.entries()) {
    if (!row.key.trim()) errors.push({ field: `requiredSections.${index}.key`, message: "必填项需要稳定 key。" });
    if (!row.label.trim()) errors.push({ field: `requiredSections.${index}.label`, message: "必填项需要 label。" });
    if (row.minimumCharacters.trim()) {
      const value = Number(row.minimumCharacters.trim());
      if (!Number.isInteger(value) || value < 0) errors.push({ field: `requiredSections.${index}.minimumCharacters`, message: "minimumCharacters 必须是非负整数。" });
    }
  }
  for (const [field, value] of [["wordLimit", form.wordLimit], ["pageLimit", form.pageLimit]] as const) {
    if (value.trim() && (!Number.isInteger(Number(value)) || Number(value) < 0)) errors.push({ field, message: `${field} 必须是非负整数。` });
  }
  return errors;
}

export function createRequiredSectionForm(existing: InstitutionRequiredSectionForm[]): InstitutionRequiredSectionForm {
  const label = "新必填项";
  return { key: normalizeRequiredSectionKey(label, existing.map((item) => item.key)), label, sectionId: "", sectionKey: "", aliasesText: "", required: true, minimumCharacters: "" };
}

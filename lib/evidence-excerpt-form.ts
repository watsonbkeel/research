import type { EvidenceExcerpt, EvidenceExcerptInput } from "./evidence-excerpts";
import type { EvidenceLocatorType } from "./types";

export interface EvidenceExcerptForm {
  id?: string;
  workId: string;
  fullTextAssetId: string;
  locatorType?: EvidenceLocatorType;
  page: string;
  locator: string;
  quote: string;
  paraphrase: string;
  claimId: string;
  supportDirection: "supporting" | "contradicting" | "mixed" | "context-only";
  strength: "low" | "medium" | "high";
  relevance: "low" | "medium" | "high";
  verificationStatus: EvidenceExcerpt["verificationStatus"];
  reviewer: string;
  reviewedAtLocal: string;
  externalModelUsePermission: "allowed" | "prohibited" | "unknown";
  exportPermission: "allowed" | "prohibited" | "unknown";
  rightsStatus: EvidenceExcerpt["rightsStatus"];
}

export function changeEvidenceWork(form: EvidenceExcerptForm, nextWorkId: string): EvidenceExcerptForm {
  if (form.workId === nextWorkId) return form;
  return { ...form, workId: nextWorkId, fullTextAssetId: "" };
}

function localDateTimeFromIso(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/u.test(value)) return `${value}T00:00`;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
}

const trimOrEmpty = (value: string | number | undefined | null) => value == null ? "" : String(value);

export function createEmptyEvidenceExcerptForm(defaultWorkId = ""): EvidenceExcerptForm {
  return {
    workId: defaultWorkId,
    fullTextAssetId: "",
    locatorType: "page",
    page: "",
    locator: "",
    quote: "",
    paraphrase: "",
    claimId: "",
    supportDirection: "supporting",
    strength: "medium",
    relevance: "medium",
    verificationStatus: "unverified",
    reviewer: "",
    reviewedAtLocal: "",
    externalModelUsePermission: "prohibited",
    exportPermission: "allowed",
    rightsStatus: "unknown",
  };
}

export function evidenceExcerptToForm(excerpt: EvidenceExcerpt): EvidenceExcerptForm {
  return {
    id: excerpt.id,
    workId: excerpt.workId,
    fullTextAssetId: excerpt.fullTextAssetId ?? "",
    locatorType: excerpt.locatorType,
    page: trimOrEmpty(excerpt.page),
    locator: trimOrEmpty(excerpt.locator),
    quote: excerpt.quote ?? "",
    paraphrase: excerpt.paraphrase ?? "",
    claimId: excerpt.claimId ?? "",
    supportDirection: excerpt.supportDirection,
    strength: excerpt.strength,
    relevance: excerpt.relevance,
    verificationStatus: excerpt.verificationStatus,
    reviewer: excerpt.reviewer ?? "",
    reviewedAtLocal: localDateTimeFromIso(excerpt.reviewedAt ?? excerpt.reviewDate),
    externalModelUsePermission: excerpt.externalModelUsePermission ?? "unknown",
    exportPermission: excerpt.exportPermission ?? "unknown",
    rightsStatus: excerpt.rightsStatus,
  };
}

export function evidenceFormToInput(form: EvidenceExcerptForm): EvidenceExcerptInput {
  const page = form.locatorType === "page" ? form.page.trim() : "";
  const locator = form.locatorType && form.locatorType !== "page" ? form.locator.trim() : "";
  const reviewedAt = form.reviewedAtLocal.trim() ? new Date(form.reviewedAtLocal).toISOString() : undefined;
  return {
    ...(form.id ? { id: form.id } : {}),
    workId: form.workId.trim(),
    ...(form.fullTextAssetId.trim() ? { fullTextAssetId: form.fullTextAssetId.trim() } : {}),
    ...(form.locatorType ? { locatorType: form.locatorType } : {}),
    ...(form.locatorType === "page" ? { page: page || null, locator: null } : {}),
    ...(form.locatorType && form.locatorType !== "page" ? { locator: locator || null, page: null } : {}),
    ...(form.quote.trim() ? { quote: form.quote.trim() } : {}),
    ...(form.paraphrase.trim() ? { paraphrase: form.paraphrase.trim() } : {}),
    ...(form.claimId.trim() ? { claimId: form.claimId.trim() } : { claimId: null }),
    supportDirection: form.supportDirection,
    strength: form.strength,
    relevance: form.relevance,
    verificationStatus: form.verificationStatus,
    ...(form.reviewer.trim() ? { reviewer: form.reviewer.trim() } : {}),
    ...(reviewedAt ? { reviewedAt } : {}),
    rightsStatus: form.rightsStatus,
    externalModelUsePermission: form.externalModelUsePermission,
    exportPermission: form.exportPermission,
  };
}

export function validateEvidenceExcerptForm(form: EvidenceExcerptForm) {
  const errors: Array<{ field: string; message: string }> = [];
  if (!form.workId.trim()) errors.push({ field: "workId", message: "请选择 Work。" });
  if (!form.locatorType) errors.push({ field: "locatorType", message: "必须明确定位类型。" });
  else if (form.locatorType === "page" && !form.page.trim()) errors.push({ field: "page", message: "页码定位必须填写 page。" });
  else if (form.locatorType !== "page" && !form.locator.trim()) errors.push({ field: "locator", message: "非页码定位必须填写 locator。" });
  if (!form.quote.trim() && !form.paraphrase.trim()) errors.push({ field: "quote", message: "quote 或 paraphrase 至少填写一项。" });
  if (["human_verified", "claim_verified"].includes(form.verificationStatus) && !form.reviewer.trim()) errors.push({ field: "reviewer", message: "人工核验必须填写核验者。" });
  if (["human_verified", "claim_verified"].includes(form.verificationStatus) && !form.reviewedAtLocal.trim()) errors.push({ field: "reviewedAtLocal", message: "人工核验必须填写核验时间。" });
  if (form.reviewedAtLocal.trim() && Number.isNaN(new Date(form.reviewedAtLocal).getTime())) errors.push({ field: "reviewedAtLocal", message: "核验时间格式无效。" });
  return errors;
}

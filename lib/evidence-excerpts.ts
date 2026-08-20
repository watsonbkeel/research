import { randomUUID } from "node:crypto";
import { getDefaultProjectId } from "./portfolio";
import { readWorkspaceState, writeWorkspaceState } from "./storage";
import { ensureEvidenceSchema } from "./evidence-store";
import { readWorkspace } from "./storage";
import { fullTextContainsQuote, getFullTextAsset } from "./full-text";
import type { EvidenceLocatorType } from "./types";

export const SUPPORT_DIRECTIONS = ["supporting", "contradicting", "mixed", "context-only"] as const;
export type SupportDirection = (typeof SUPPORT_DIRECTIONS)[number];

export const EVIDENCE_STRENGTHS = ["low", "medium", "high"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];
export const EVIDENCE_LOCATOR_TYPES = ["page", "chapter", "section", "paragraph", "figure", "table"] as const satisfies readonly EvidenceLocatorType[];

export const VERIFICATION_STATUSES = [
  "unverified",
  "ai_suggested",
  "human_verified",
  "rejected",
  // Legacy aliases are accepted for migration only and are never trusted by formal audits without reviewer metadata.
  "metadata_verified",
  "abstract_verified",
  "full_text_verified",
  "claim_verified",
  "rejected",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const RIGHTS_STATUSES = ["unknown", "cleared", "restricted", "prohibited"] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export interface EvidenceExcerpt {
  projectId?: string;
  id: string;
  workId: string;
  fullTextAssetId?: string;
  locatorType?: EvidenceLocatorType;
  locator?: string;
  page?: string;
  quote?: string;
  paraphrase?: string;
  claimId?: string | null;
  supportDirection: SupportDirection;
  strength: EvidenceStrength;
  relevance: EvidenceStrength;
  reviewer?: string;
  /** Canonical evidence-review timestamp. reviewDate is retained for old clients. */
  reviewedAt?: string;
  reviewDate?: string;
  verificationStatus: VerificationStatus;
  rightsStatus: RightsStatus;
  localUsePermission?: "allowed" | "prohibited" | "unknown";
  externalModelUsePermission?: "allowed" | "prohibited" | "unknown";
  quotationLimit?: number;
  exportPermission?: "allowed" | "prohibited" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface ClaimEvidenceLink {
  id: string;
  projectId?: string;
  claimId: string;
  evidenceExcerptId: string;
  relation?: "supports" | "contradicts" | "qualifies" | "background";
  status?: "ai_suggested" | "human_verified" | "rejected";
}

export interface EvidenceExcerptInput {
  id?: string;
  workId: string;
  fullTextAssetId?: string;
  locatorType?: EvidenceLocatorType;
  locator?: string;
  page?: string | number;
  quote?: string;
  paraphrase?: string;
  claimId?: string | null;
  supportDirection?: SupportDirection;
  strength?: EvidenceStrength;
  relevance?: EvidenceStrength;
  reviewer?: string;
  reviewedAt?: string;
  reviewDate?: string;
  verificationStatus?: VerificationStatus;
  rightsStatus?: RightsStatus;
  localUsePermission?: "allowed" | "prohibited" | "unknown";
  externalModelUsePermission?: "allowed" | "prohibited" | "unknown";
  quotationLimit?: number;
  exportPermission?: "allowed" | "prohibited" | "unknown";
}

export type EvidenceExcerptPatch = Partial<Omit<EvidenceExcerptInput, "id" | "workId">> & {
  id: string;
  workId?: string;
};

const STATE_KEY = "evidence_excerpts";
const MAX_QUOTE_LENGTH = 2000;
const MAX_PARAPHRASE_LENGTH = 5000;
function readExcerpts(projectId?: string): EvidenceExcerpt[] {
  const parsed = readWorkspaceState<unknown>(STATE_KEY, projectId);
  return Array.isArray(parsed) ? (parsed as EvidenceExcerpt[]).map((item) => {
    const reviewedAt = item.reviewedAt ?? item.reviewDate;
    return {
      ...item,
      projectId: item.projectId ?? projectId,
      reviewedAt,
      reviewDate: item.reviewDate ?? reviewedAt,
      verificationStatus: projectId && item.verificationStatus === "claim_verified" && (!item.reviewer || !reviewedAt) ? "ai_suggested" : item.verificationStatus,
    };
  }) : [];
}

function writeExcerpts(excerpts: EvidenceExcerpt[], projectId?: string) {
  writeWorkspaceState(STATE_KEY, excerpts, projectId);
}

function optionalString(value: unknown, field: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.length > maxLength) throw new EvidenceExcerptValidationError(`${field}长度或格式无效。`);
  return value;
}

function normalizePage(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && value.length <= 80 && value.trim().length > 0) return value.trim();
  throw new EvidenceExcerptValidationError("page格式无效。");
}

function ensureEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T, field: string): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new EvidenceExcerptValidationError(`${field}值无效。`);
  return value as T;
}

function validateInput(input: EvidenceExcerptInput, allowLegacy = false): Omit<EvidenceExcerpt, "id" | "createdAt" | "updatedAt"> {
  if (!input || typeof input !== "object" || typeof input.workId !== "string" || input.workId.trim().length === 0 || input.workId.length > 200) {
    throw new EvidenceExcerptValidationError("workId为必填项。 ");
  }
  const quote = optionalString(input.quote, "quote", MAX_QUOTE_LENGTH);
  const paraphrase = optionalString(input.paraphrase, "paraphrase", MAX_PARAPHRASE_LENGTH);
  if (!quote && !paraphrase) throw new EvidenceExcerptValidationError("quote或paraphrase至少填写一项。");
  if (input.claimId !== undefined && input.claimId !== null && (typeof input.claimId !== "string" || input.claimId.length > 200)) {
    throw new EvidenceExcerptValidationError("claimId格式无效。");
  }
  const reviewer = optionalString(input.reviewer, "reviewer", 200);
  const reviewedAt = optionalString(input.reviewedAt ?? input.reviewDate, "reviewedAt", 40);
  const fullTextAssetId = optionalString(input.fullTextAssetId, "fullTextAssetId", 200);
  const quotationLimit = input.quotationLimit === undefined ? undefined : input.quotationLimit;
  if (quotationLimit !== undefined && (!Number.isInteger(quotationLimit) || quotationLimit < 0 || quotationLimit > MAX_QUOTE_LENGTH)) {
    throw new EvidenceExcerptValidationError("quotationLimit格式无效。");
  }
  const verificationStatus = ensureEnum(input.verificationStatus, VERIFICATION_STATUSES, "unverified", "verificationStatus");
  const page = normalizePage(input.page);
  const locator = optionalString(input.locator, "locator", 500);
  const locatorType = page
    ? "page"
    : input.locatorType === undefined
      ? undefined
      : ensureEnum(input.locatorType, EVIDENCE_LOCATOR_TYPES, "page", "locatorType");
  if (!allowLegacy && ["human_verified", "claim_verified"].includes(verificationStatus) && (!reviewer || !reviewedAt)) throw new EvidenceExcerptValidationError("human_verified必须同时填写reviewer和reviewedAt。");
  if (!allowLegacy && (quote || paraphrase) && !page && !locator) throw new EvidenceExcerptValidationError("直接引文或研究者释义必须填写page或locator定位。");
  if (!allowLegacy && locator && !locatorType) throw new EvidenceExcerptValidationError("填写locator时必须明确locatorType。");
  return {
    projectId: undefined,
    workId: input.workId.trim(),
    fullTextAssetId,
    locatorType,
    locator,
    page,
    quote,
    paraphrase,
    claimId: input.claimId ?? null,
    supportDirection: ensureEnum(input.supportDirection, SUPPORT_DIRECTIONS, "supporting", "supportDirection"),
    strength: ensureEnum(input.strength, EVIDENCE_STRENGTHS, "medium", "strength"),
    relevance: ensureEnum(input.relevance, EVIDENCE_STRENGTHS, "medium", "relevance"),
    reviewer,
    reviewedAt,
    // Keep the legacy field in saved JSON so existing clients continue to render dates.
    reviewDate: reviewedAt,
    verificationStatus,
    rightsStatus: ensureEnum(input.rightsStatus, RIGHTS_STATUSES, "unknown", "rightsStatus"),
    localUsePermission: ensureEnum(input.localUsePermission, ["allowed", "prohibited", "unknown"] as const, "unknown", "localUsePermission"),
    externalModelUsePermission: ensureEnum(input.externalModelUsePermission, ["allowed", "prohibited", "unknown"] as const, "unknown", "externalModelUsePermission"),
    quotationLimit,
    exportPermission: ensureEnum(input.exportPermission, ["allowed", "prohibited", "unknown"] as const, "unknown", "exportPermission"),
  };
}

export class EvidenceExcerptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceExcerptValidationError";
  }
}

export async function listEvidenceExcerpts(filters: { id?: string; workId?: string; claimId?: string; projectId?: string } = {}) {
  ensureEvidenceSchema();
  if (filters.projectId) await readWorkspace(filters.projectId);
  return readExcerpts(filters.projectId).filter((excerpt) =>
    (!filters.id || excerpt.id === filters.id) &&
    (!filters.workId || excerpt.workId === filters.workId) &&
    (!filters.claimId || excerpt.claimId === filters.claimId),
  );
}

export async function createEvidenceExcerpt(input: EvidenceExcerptInput, projectId?: string): Promise<EvidenceExcerpt> {
  ensureEvidenceSchema();
  const resolvedProjectId = projectId ?? getDefaultProjectId();
  const workspace = await readWorkspace(resolvedProjectId);
  const work = workspace.works.find((item) => item.id === input.workId);
  if (projectId && !work) throw new EvidenceExcerptValidationError("Work不存在或不属于当前项目。");
  if (projectId && work?.bibliographicStatus !== "verified") throw new EvidenceExcerptValidationError("Work书目信息尚未verified，不能建立正式证据摘录。");
  const excerpts = readExcerpts(projectId);
  const normalized = validateInput(input, !projectId);
  if (projectId && normalized.fullTextAssetId) {
    const asset = getFullTextAsset(projectId, normalized.fullTextAssetId);
    if (!asset || asset.workId !== input.workId) throw new EvidenceExcerptValidationError("FullTextAsset不存在或不属于当前Work。");
    if (normalized.quote && !fullTextContainsQuote(projectId, normalized.fullTextAssetId, normalized.quote)) throw new EvidenceExcerptValidationError("quote未在指定FullTextAsset的本地解析文本中找到，不能标记为可核验原文。");
  }
  const id = input.id?.trim() || `excerpt-${randomUUID()}`;
  if (excerpts.some((excerpt) => excerpt.id === id)) throw new EvidenceExcerptValidationError("EvidenceExcerpt ID已存在。");
  const now = new Date().toISOString();
  const excerpt: EvidenceExcerpt = { id, ...normalized, projectId: resolvedProjectId, createdAt: now, updatedAt: now };
  excerpts.push(excerpt);
  writeExcerpts(excerpts, projectId);
  return excerpt;
}

export async function updateEvidenceExcerpt(patch: EvidenceExcerptPatch, projectId?: string): Promise<EvidenceExcerpt> {
  ensureEvidenceSchema();
  const excerpts = readExcerpts(projectId);
  const index = excerpts.findIndex((excerpt) => excerpt.id === patch.id);
  if (index < 0) throw new EvidenceExcerptValidationError("EvidenceExcerpt不存在。");
  const current = excerpts[index];
  const candidate: EvidenceExcerptInput = { ...current, ...patch, id: current.id, page: patch.page ?? current.page };
  if (projectId) {
    const workspace = await readWorkspace(projectId); const work = workspace.works.find((item) => item.id === candidate.workId);
    if (!work) throw new EvidenceExcerptValidationError("Work不存在或不属于当前项目。");
    if (work.bibliographicStatus !== "verified") throw new EvidenceExcerptValidationError("Work书目信息尚未verified，不能建立正式证据摘录。");
  }
  const normalized = validateInput(candidate, !projectId);
  if (projectId && normalized.fullTextAssetId) {
    const asset = getFullTextAsset(projectId, normalized.fullTextAssetId);
    if (!asset || asset.workId !== candidate.workId) throw new EvidenceExcerptValidationError("FullTextAsset不存在或不属于当前Work。");
    if (normalized.quote && !fullTextContainsQuote(projectId, normalized.fullTextAssetId, normalized.quote)) throw new EvidenceExcerptValidationError("quote未在指定FullTextAsset的本地解析文本中找到，不能标记为可核验原文。");
  }
  const updated: EvidenceExcerpt = { ...current, ...normalized, updatedAt: new Date().toISOString() };
  excerpts[index] = updated;
  writeExcerpts(excerpts, projectId);
  return updated;
}

export async function deleteEvidenceExcerpt(id: string, projectId?: string): Promise<void> {
  ensureEvidenceSchema();
  const excerpts = readExcerpts(projectId);
  if (!excerpts.some((excerpt) => excerpt.id === id)) throw new EvidenceExcerptValidationError("EvidenceExcerpt不存在。");
  writeExcerpts(excerpts.filter((excerpt) => excerpt.id !== id), projectId);
}

export async function listClaimEvidenceLinks(claimId: string, projectId?: string): Promise<ClaimEvidenceLink[]> {
  const excerpts = await listEvidenceExcerpts({ claimId, projectId });
  if (!projectId) return excerpts.map((excerpt) => ({ id: `${claimId}:${excerpt.id}`, claimId, evidenceExcerptId: excerpt.id }));
  return excerpts.map((excerpt) => ({ id: `${claimId}:${excerpt.id}`, projectId, claimId, evidenceExcerptId: excerpt.id, relation: excerpt.supportDirection === "contradicting" ? "contradicts" : excerpt.supportDirection === "context-only" ? "background" : "supports", status: ["human_verified", "claim_verified"].includes(excerpt.verificationStatus) ? "human_verified" : "ai_suggested" }));
}

export function effectiveVerificationStatus(excerpt: EvidenceExcerpt): "unverified" | "ai_suggested" | "human_verified" | "rejected" {
  if (excerpt.verificationStatus === "rejected") return "rejected";
  if ((excerpt.verificationStatus === "human_verified" || excerpt.verificationStatus === "claim_verified") && excerpt.reviewer && (excerpt.reviewedAt ?? excerpt.reviewDate)) return "human_verified";
  if (excerpt.verificationStatus === "ai_suggested" || excerpt.verificationStatus === "claim_verified" || excerpt.verificationStatus === "full_text_verified") return "ai_suggested";
  return "unverified";
}

import { randomUUID } from "node:crypto";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

export const SUPPORT_DIRECTIONS = ["supporting", "contradicting", "mixed", "context-only"] as const;
export type SupportDirection = (typeof SUPPORT_DIRECTIONS)[number];

export const EVIDENCE_STRENGTHS = ["low", "medium", "high"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTHS)[number];

export const VERIFICATION_STATUSES = [
  "unverified",
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
  id: string;
  workId: string;
  locator?: string;
  page?: string;
  quote?: string;
  paraphrase?: string;
  claimId?: string | null;
  supportDirection: SupportDirection;
  strength: EvidenceStrength;
  relevance: EvidenceStrength;
  reviewer?: string;
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
  claimId: string;
  evidenceExcerptId: string;
}

export interface EvidenceExcerptInput {
  id?: string;
  workId: string;
  locator?: string;
  page?: string | number;
  quote?: string;
  paraphrase?: string;
  claimId?: string | null;
  supportDirection?: SupportDirection;
  strength?: EvidenceStrength;
  relevance?: EvidenceStrength;
  reviewer?: string;
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
  return Array.isArray(parsed) ? parsed as EvidenceExcerpt[] : [];
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

function validateInput(input: EvidenceExcerptInput): Omit<EvidenceExcerpt, "id" | "createdAt" | "updatedAt"> {
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
  const reviewDate = optionalString(input.reviewDate, "reviewDate", 40);
  const quotationLimit = input.quotationLimit === undefined ? undefined : input.quotationLimit;
  if (quotationLimit !== undefined && (!Number.isInteger(quotationLimit) || quotationLimit < 0 || quotationLimit > MAX_QUOTE_LENGTH)) {
    throw new EvidenceExcerptValidationError("quotationLimit格式无效。");
  }
  return {
    workId: input.workId.trim(),
    locator: optionalString(input.locator, "locator", 500),
    page: normalizePage(input.page),
    quote,
    paraphrase,
    claimId: input.claimId ?? null,
    supportDirection: ensureEnum(input.supportDirection, SUPPORT_DIRECTIONS, "supporting", "supportDirection"),
    strength: ensureEnum(input.strength, EVIDENCE_STRENGTHS, "medium", "strength"),
    relevance: ensureEnum(input.relevance, EVIDENCE_STRENGTHS, "medium", "relevance"),
    reviewer,
    reviewDate,
    verificationStatus: ensureEnum(input.verificationStatus, VERIFICATION_STATUSES, "unverified", "verificationStatus"),
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
  return readExcerpts(filters.projectId).filter((excerpt) =>
    (!filters.id || excerpt.id === filters.id) &&
    (!filters.workId || excerpt.workId === filters.workId) &&
    (!filters.claimId || excerpt.claimId === filters.claimId),
  );
}

export async function createEvidenceExcerpt(input: EvidenceExcerptInput, projectId?: string): Promise<EvidenceExcerpt> {
  const excerpts = readExcerpts(projectId);
  const normalized = validateInput(input);
  const id = input.id?.trim() || `excerpt-${randomUUID()}`;
  if (excerpts.some((excerpt) => excerpt.id === id)) throw new EvidenceExcerptValidationError("EvidenceExcerpt ID已存在。");
  const now = new Date().toISOString();
  const excerpt: EvidenceExcerpt = { id, ...normalized, createdAt: now, updatedAt: now };
  excerpts.push(excerpt);
  writeExcerpts(excerpts, projectId);
  return excerpt;
}

export async function updateEvidenceExcerpt(patch: EvidenceExcerptPatch, projectId?: string): Promise<EvidenceExcerpt> {
  const excerpts = readExcerpts(projectId);
  const index = excerpts.findIndex((excerpt) => excerpt.id === patch.id);
  if (index < 0) throw new EvidenceExcerptValidationError("EvidenceExcerpt不存在。");
  const current = excerpts[index];
  const candidate: EvidenceExcerptInput = { ...current, ...patch, id: current.id, page: patch.page ?? current.page };
  const normalized = validateInput(candidate);
  const updated: EvidenceExcerpt = { ...current, ...normalized, updatedAt: new Date().toISOString() };
  excerpts[index] = updated;
  writeExcerpts(excerpts, projectId);
  return updated;
}

export async function deleteEvidenceExcerpt(id: string, projectId?: string): Promise<void> {
  const excerpts = readExcerpts(projectId);
  if (!excerpts.some((excerpt) => excerpt.id === id)) throw new EvidenceExcerptValidationError("EvidenceExcerpt不存在。");
  writeExcerpts(excerpts.filter((excerpt) => excerpt.id !== id), projectId);
}

export async function listClaimEvidenceLinks(claimId: string, projectId?: string): Promise<ClaimEvidenceLink[]> {
  const excerpts = await listEvidenceExcerpts({ claimId, projectId });
  return excerpts.map((excerpt) => ({ id: `${claimId}:${excerpt.id}`, claimId, evidenceExcerptId: excerpt.id }));
}

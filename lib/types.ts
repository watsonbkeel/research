export type EvidenceStatus =
  | "未核验"
  | "DOI已核对"
  | "书目信息已核对"
  | "摘要已核对"
  | "全文已阅读"
  | "论断证据已定位";

export type BibliographicVerificationStatus = "unverified" | "verified" | "partial_match" | "mismatch" | "failed";
export type FullTextStatus = "unavailable" | "available" | "parsed" | "reviewed" | "parse_failed";
export type ClaimEvidenceVerificationStatus = "unverified" | "ai_suggested" | "human_verified" | "rejected";
export type RetractionStatus = "clear" | "corrected" | "retracted" | "unknown";
export type ResearchMode = "prospective" | "empirical" | "theoretical" | "review";
export type EvidenceMode = "exploratory" | "formal";
export type PublicationStatusCheckState = "unchecked" | "checked" | "failed";
export type PublicationStatus = "clear" | "corrected" | "retracted" | "expression_of_concern" | "unknown";

export type ChecklistStatus = "未开始" | "进行中" | "已满足" | "待确认";

export interface Project {
  id: string;
  titleEn: string;
  titleZh: string;
  field: string;
  context: string;
  institution: string;
  primaryOutcome: string;
  secondaryOutcome: string;
  designLanguage: "中文";
  writingLanguage: "English";
  citationStyle: "APA 7" | "GB/T 7714";
  version: string;
}

export interface ConfirmationItem {
  id: string;
  category: string;
  title: string;
  status: ChecklistStatus;
  evidence: string;
}

export interface Work {
  id: string;
  authors: string;
  authorsStructured?: Array<{ family: string; given?: string; orcid?: string }>;
  year: number;
  title: string;
  venue: string;
  sourceType?: "journal-article" | "book" | "chapter" | "conference-paper" | "thesis" | "report" | "web-page" | "dataset";
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  isbn?: string;
  issn?: string;
  url?: string;
  accessedDate?: string;
  database?: string;
  identifiers?: Record<string, string>;
  abstract?: string;
  authorKeywords?: string[];
  indexKeywords?: string[];
  fullTextPath?: string;
  fullTextChecksum?: string;
  fullTextVersion?: string;
  accessRights?: "open" | "licensed" | "restricted" | "unknown";
  peerReviewStatus?: "peer-reviewed" | "not-peer-reviewed" | "unknown";
  retractionStatus?: "clear" | "corrected" | "retracted" | "unknown";
  importSource?: string;
  importedAt?: string;
  duplicateClusterId?: string;
  canonicalRecordId?: string;
  doi?: string;
  group: "直接重合" | "相邻研究" | "理论来源" | "量表来源" | "方法来源";
  status: EvidenceStatus;
  bibliographicStatus?: BibliographicVerificationStatus;
  fullTextStatus?: FullTextStatus;
  legacyStatusRequiresReverification?: boolean;
  relevance: string;
}

export interface VerificationEvent {
  id: string;
  projectId?: string;
  candidateId?: string;
  workId?: string;
  provider: "crossref" | "openalex" | "publisher" | "manual" | "import";
  inputIdentifier: string;
  checkedAt: string;
  matchedFields: { doi: boolean; title: boolean; authors: boolean; year: boolean; venue: boolean };
  result: BibliographicVerificationStatus;
  retractionStatus: RetractionStatus;
  rawResponseHash?: string;
  notes?: string;
}

export interface PublicationStatusCheckResult {
  id?: string;
  projectId?: string;
  workId?: string;
  checkState: PublicationStatusCheckState;
  status: PublicationStatus;
  checkedAt: string;
  provider: string;
  relatedItems: Array<{ relationType: string; doi?: string; title?: string; publishedAt?: string }>;
  notes?: string;
  rawResponseHash?: string;
}

export interface CandidateRecord {
  id: string;
  projectId: string;
  searchRunId?: string;
  provider: "openalex" | "crossref" | "semantic-scholar" | "manual";
  providerRecordId: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  status: "discovered" | "verification_pending" | "promoted" | "rejected";
  createdAt: string;
  updatedAt: string;
}

export interface FullTextAsset {
  id: string;
  projectId: string;
  workId: string;
  source: "user_upload" | "open_access" | "licensed_local" | "manual";
  localPath?: string;
  checksum: string;
  mimeType: string;
  pageCount?: number;
  status: Exclude<FullTextStatus, "unavailable">;
  rightsStatus: "open" | "licensed" | "restricted" | "unknown";
  externalModelUsePermission: "allowed" | "prohibited" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceExcerptRecord {
  id: string;
  projectId: string;
  workId: string;
  fullTextAssetId?: string;
  quote?: string;
  paraphrase?: string;
  page?: string;
  locator?: string;
  claimId?: string;
  supportDirection: "supporting" | "contradicting" | "mixed" | "context-only";
  strength: "low" | "medium" | "high";
  relevance: "low" | "medium" | "high";
  verificationStatus: ClaimEvidenceVerificationStatus;
  reviewer?: string;
  reviewedAt?: string;
  rightsStatus: "open" | "licensed" | "restricted" | "unknown";
  externalModelUsePermission: "allowed" | "prohibited" | "unknown";
  exportPermission: "allowed" | "prohibited" | "unknown";
  createdAt: string;
  updatedAt: string;
}

export interface ClaimEvidenceLink {
  id: string;
  projectId: string;
  claimId: string;
  evidenceExcerptId: string;
  relation: "supports" | "contradicts" | "qualifies" | "background";
  status: "ai_suggested" | "human_verified" | "rejected";
}

export interface SectionEvidenceBundle {
  id: string;
  projectId: string;
  documentId: string;
  sectionId: string;
  mode: "exploratory" | "formal";
  claims: Array<{
    claimId: string;
    text: string;
    kind: "published_fact" | "researcher_inference" | "planned_hypothesis" | "planned_method";
    evidence: Array<{
      evidenceExcerptId: string; workId: string; authors: string; year: number; title: string; venue?: string; doi?: string;
      quote?: string; paraphrase?: string; locator?: string; supportDirection: string; strength: string; verificationStatus: string;
      reviewer?: string; reviewedAt?: string;
      externalModelUsePermission?: "allowed" | "prohibited" | "unknown";
    }>;
  }>;
  unresolvedClaims: Array<{ claimId: string; reason: string }>;
  createdAt: string;
}

export interface StructuredSectionDraft {
  projectId: string;
  documentId: string;
  sectionId: string;
  paragraphs: Array<{ markdown: string; claims: Array<{ claimId: string; claimText: string; kind: "published_fact" | "researcher_inference" | "planned_hypothesis" | "planned_method"; evidenceExcerptIds: string[]; citationWorkIds: string[] }> }>;
  unsupportedStatements: Array<{ statement: string; reason: string }>;
  assumptions: string[];
  evidenceGaps: string[];
}

export interface AuditIssue { code: string; severity: "blocker" | "warning"; message: string; sectionId?: string; claimId?: string; workId?: string; evidenceExcerptId?: string }
export interface CitationAuditReport {
  id: string; projectId: string; documentId: string; versionId: string; documentVersionId?: string; contentHash?: string; status: "passed" | "passed_with_warnings" | "blocked";
  blockers: AuditIssue[]; warnings: AuditIssue[]; claimCoverageReportId?: string; checkedAt: string; checkerVersion: string;
}

export type CoverageClassification = "published_fact" | "researcher_inference" | "planned_hypothesis" | "planned_method" | "literature_definition" | "author_defined_term" | "definition" | "connective" | "heading" | "unknown";
export interface CitationOffset { citationItemId: string; workId: string; startOffset: number; endOffset: number; locatorType?: string; locator?: string }
export interface ParsedParagraph { paragraphId: string; rawText: string; plainText: string; startOffset: number; endOffset: number; citations: CitationOffset[] }
export interface SentenceClassificationResult { sentenceId: string; classification: Exclude<CoverageClassification, "definition">; claimSpans: Array<{ text: string; startOffset: number; endOffset: number; suggestedClaimId?: string }>; confidence: number; rationaleCode: string }
export interface ClaimEvidenceCitationBinding { id: string; projectId: string; documentId: string; documentVersionId: string; sectionId: string; sentenceId: string; claimId: string; evidenceExcerptId: string; workId: string; citationItemId: string; relation: "supports" | "qualifies" | "contradicts" | "background"; createdAt: string }
export interface ParagraphCoverage {
  paragraphId: string;
  sectionId: string;
  textHash: string;
  rawText?: string; plainText?: string; startOffset?: number; endOffset?: number; citations?: CitationOffset[];
  sentences: Array<{ sentenceId: string; text: string; startOffset?: number; endOffset?: number; classification: CoverageClassification; claimId?: string; claimIds?: string[]; evidenceExcerptIds: string[]; citationWorkIds: string[]; citationItemIds?: string[]; coverageStatus: "covered" | "not_required" | "unsupported" | "unclassified" }>;
  coverageRatio: number;
}
export interface ClaimCoverageReport {
  id: string;
  projectId: string;
  documentId: string;
  versionId: string;
  documentVersionId?: string;
  contentHash?: string;
  status: "passed" | "passed_with_warnings" | "blocked";
  paragraphs: ParagraphCoverage[];
  blockers: AuditIssue[];
  warnings: AuditIssue[];
  checkedAt: string;
  checkerVersion: string;
  totals?: { sentenceCount: number; publishedFactCount: number; supportedPublishedFactCount: number; unsupportedPublishedFactCount: number; unknownCount: number };
}

export interface DocumentVersion {
  id: string;
  projectId: string;
  documentId: string;
  versionNumber: number;
  parentVersionId?: string;
  title?: string; researchMode?: string; evidenceMode?: string; targetVenue?: string; institutionProfileId?: string;
  sections: Array<{ sectionId: string; chapterId?: string; title: string; order?: number; content: string; claimIds: string[]; citationIds: string[]; citationItemIds?: string[]; evidenceExcerptIds: string[]; evidenceBundleId?: string; unsupportedStatements: string[] | Array<{ statement: string; reason: string }>; evidenceGaps: string[] | Array<{ description: string; requiredEvidenceType?: string }>; contentHash: string }>;
  claimEvidenceCitationBindings?: ClaimEvidenceCitationBinding[];
  manuscriptSnapshot?: import("./manuscript").Manuscript;
  contentHash?: string;
  citationAuditReportId?: string;
  consistencyReviewReportId?: string;
  claimCoverageReportId?: string;
  approvalStatus: "not_reviewed" | "approved" | "changes_requested";
  createdBy: string;
  createdAt: string;
}

export type GenerationAttemptStatus = "generated" | "schema_failed" | "audit_blocked" | "quarantined" | "promoted" | "discarded";
export interface QuarantinedDraft {
  id: string;
  projectId: string;
  documentId: string;
  sectionId: string;
  content: string;
  structuredDraft: StructuredSectionDraft;
  coverageReportId?: string;
  citationAuditReportId?: string;
  blockers: AuditIssue[];
  warnings: AuditIssue[];
  status: "blocked" | "awaiting_revision" | "promoted" | "discarded";
  createdAt: string;
}

export interface FormalExportGateResult {
  allowed: boolean;
  blockers: Array<{ code: string; message: string; sectionId?: string; claimId?: string; workId?: string }>;
  warnings: Array<{ code: string; message: string }>;
  evidenceSummary: { candidateCount: number; verifiedWorkCount: number; citedWorkCount: number; humanVerifiedExcerptCount: number; coveredClaimCount: number; unsupportedClaimCount: number; unknownPublicationStatusCount: number };
}

export interface ExportAuditManifest {
  id?: string;
  projectId: string;
  documentId: string;
  versionId: string;
  exportedAt: string;
  citationAuditReportId: string;
  consistencyReviewReportId: string;
  claimCoverageReportId: string;
  humanApproval: { status: string; reviewer?: string; reviewedAt?: string };
  evidenceSummary: { citedWorks: number; bibliographicallyVerifiedWorks: number; publicationStatusCheckedWorks: number; humanVerifiedExcerpts: number; supportedPublishedFacts: number; unsupportedPublishedFacts: number };
  blockers: number;
  warnings: number;
  contentHash: string;
}

export interface HumanApproval {
  id: string;
  projectId: string;
  documentId: string;
  documentVersionId: string;
  decision: "approved" | "changes_requested";
  reviewer: string;
  reviewedAt: string;
  notes?: string;
}

export interface PublicationStatusOverride {
  id: string;
  projectId: string;
  workId: string;
  documentVersionId: string;
  reviewer: string;
  reviewedAt: string;
  reason: string;
  decision: "allow_unknown_for_this_version";
}

export interface AssistantWorkflowRun {
  id: string;
  projectId: string;
  documentId: string;
  sectionId?: string;
  intent: string;
  state: "planning" | "analyzing_section" | "extracting_claims" | "compiling_claim_coverage" | "auditing" | "matching_existing_evidence" | "searching_candidates" | "verifying_metadata" | "awaiting_full_text" | "suggesting_excerpts" | "awaiting_human_verification" | "drafting_revision" | "awaiting_revision_approval" | "applying_revision" | "reauditing" | "completed" | "blocked" | "failed";
  actions: Array<{ id: string; tool: string; inputSummary: string; outputSummary?: string; status: "pending" | "running" | "completed" | "blocked" | "failed"; createdAt: string; completedAt?: string; error?: string }>;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConsistencyReviewReport {
  id: string; projectId: string; documentId: string; versionId: string; documentVersionId?: string; contentHash?: string;
  status: "not_run" | "running" | "passed" | "passed_with_warnings" | "blocked";
  issues: Array<{ severity: "blocker" | "warning"; sourceSectionId?: string; targetSectionId?: string; issue: string; recommendation: string }>;
  humanApproval: "not_reviewed" | "approved" | "changes_requested"; reviewer?: string; reviewedAt?: string; approvalDocumentVersionId?: string; checkedAt: string; checkerVersion: string;
}

export interface Construct {
  id: string;
  nameEn: string;
  nameZh: string;
  role: "刺激" | "中介" | "结果" | "调节" | "控制";
  theoryId: string;
  definition: string;
  measurement: string;
  sourceWorkIds: string[];
}

export interface Theory {
  id: string;
  name: string;
  role: "情境基础" | "主导理论" | "机制理论" | "组织框架";
  use: string;
  boundary: string;
  sourceWorkIds: string[];
}

export interface Experiment {
  id: string;
  name: string;
  objective: string;
  design: string;
  conditions: string[];
  constants: string[];
  primaryTest: string;
  ethics: string;
}

export interface Claim {
  id: string;
  text: string;
  kind: "已发表事实" | "研究者推论" | "待检验假设";
  citationIds: string[];
  location?: string;
}

export interface NoveltyDimension {
  dimension: string;
  existing: string;
  proposed: string;
  assessment: "证据充分" | "证据有限" | "尚需人工核验";
}

export interface WorkspaceData {
  schemaVersion: number;
  project: Project;
  confirmation: ConfirmationItem[];
  works: Work[];
  theories: Theory[];
  constructs: Construct[];
  experiments: Experiment[];
  claims: Claim[];
  novelty: NoveltyDimension[];
  updatedAt: string;
}

/** Tasks are intentionally a closed set so every model route is auditable. */
export type TaskType =
  | "literature_search"
  | "literature_summary"
  | "evidence_verification"
  | "chinese_research_design"
  | "english_academic_writing"
  | "citation_validation"
  | "translation"
  | "formatting";

export interface ModelProfile {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  /** Reference used to resolve a restricted local secret or an environment variable. */
  apiKeyRef: string;
  enabled: boolean;
  priority: number;
  notes: string;
}

export interface TaskRoute {
  taskType: TaskType;
  defaultProfileId: string | null;
  fallbackProfileIds: string[];
}

export interface ModelSettings {
  profiles: ModelProfile[];
  routes: TaskRoute[];
  allowFullText: boolean;
}

export interface PublicModelProfile extends Omit<ModelProfile, "apiKeyRef"> {
  /** The reference name is safe to expose; the secret value is not. */
  apiKeyRef: string;
  hasApiKey: boolean;
}

export interface PublicModelSettings {
  profiles: PublicModelProfile[];
  routes: TaskRoute[];
  allowFullText: boolean;
}

export type PublicSettings = PublicModelSettings;
export type PrivateSettings = ModelSettings;

export interface GenerationAuditEntry {
  id: number;
  taskType: TaskType;
  profileId: string;
  profileName: string;
  model: string;
  durationMs: number;
  status: "succeeded" | "failed";
  errorCategory?: string;
  httpStatus?: number;
  createdAt: string;
}

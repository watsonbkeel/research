export type EvidenceStatus =
  | "DOI已核对"
  | "书目信息已核对"
  | "摘要已核对"
  | "全文已阅读"
  | "论断证据已定位";

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
  citationStyle: "APA 7";
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
  relevance: string;
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

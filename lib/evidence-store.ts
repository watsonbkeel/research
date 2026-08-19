import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { portfolioDatabase, readProjectState, writeProjectState } from "./portfolio";
import type { CandidateRecord, ConsistencyReviewReport, CitationAuditReport, VerificationEvent, Work, QuarantinedDraft, ClaimEvidenceCitationBinding, HumanApproval, PublicationStatusOverride } from "./types";
import { runMigration } from "./migration-service";

const MIGRATION_ID = "evidence-closure-v2";
const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

function migrateLegacyRecords() {
  const db = portfolioDatabase();
  const projects = db.prepare("SELECT id FROM projects").all() as Array<{ id: string }>;
  const verifiedWorkIds = new Set((db.prepare("SELECT DISTINCT work_id AS workId FROM verification_events WHERE result='verified' AND work_id IS NOT NULL").all() as Array<{ workId?: string }>).map((row) => row.workId).filter((value): value is string => Boolean(value)));
  for (const { id: projectId } of projects) {
    const workspace = readProjectState<{ schemaVersion: number; works: Work[]; updatedAt: string }>(projectId, "workspace");
    if (workspace) {
      let changed = false;
      workspace.works = workspace.works.map((work) => {
        const hasVerifiedEvent = verifiedWorkIds.has(work.id);
        const nextStatus = hasVerifiedEvent ? "verified" : "unverified";
        const next = { ...work, bibliographicStatus: nextStatus as Work["bibliographicStatus"], fullTextStatus: work.fullTextStatus ?? (work.fullTextPath ? "available" : "unavailable"), legacyStatusRequiresReverification: !hasVerifiedEvent, retractionStatus: work.retractionStatus ?? "unknown" };
        if (work.bibliographicStatus !== next.bibliographicStatus || work.legacyStatusRequiresReverification !== next.legacyStatusRequiresReverification || work.fullTextStatus !== next.fullTextStatus || work.retractionStatus !== next.retractionStatus) changed = true;
        return next;
      });
      if (changed) { workspace.schemaVersion = Math.max(4, workspace.schemaVersion + 1); workspace.updatedAt = now(); writeProjectState(projectId, "workspace", workspace, workspace.schemaVersion); }
    }
    const projectWorks = db.prepare("SELECT work_id AS workId FROM project_works WHERE project_id=?").all(projectId) as Array<{ workId: string }>;
    for (const projectWork of projectWorks) {
      db.prepare("UPDATE project_works SET verification_status=?,updated_at=? WHERE project_id=? AND work_id=?").run(verifiedWorkIds.has(projectWork.workId) ? "verified" : "unverified", now(), projectId, projectWork.workId);
    }
    const excerpts = readProjectState<Array<Record<string, unknown>>>(projectId, "evidence_excerpts") ?? [];
    if (excerpts.length) {
      const migrated = excerpts.map((item) => ({
        ...item,
        projectId,
        supportDirection: ["supporting", "contradicting", "mixed", "context-only"].includes(String(item.supportDirection)) ? item.supportDirection : "context-only",
        strength: ["low", "medium", "high"].includes(String(item.strength)) ? item.strength : "low",
        relevance: ["low", "medium", "high"].includes(String(item.relevance)) ? item.relevance : "medium",
        verificationStatus: item.verificationStatus === "rejected" ? "rejected" : item.verificationStatus === "unverified" ? "unverified" : "ai_suggested",
        reviewedAt: undefined,
        reviewer: undefined,
        legacyStatusRequiresReverification: true,
        updatedAt: String(item.updatedAt ?? now()),
        createdAt: String(item.createdAt ?? now()),
      }));
      writeProjectState(projectId, "evidence_excerpts", migrated, 2);
    }
  }
  if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_candidates'").get()) {
    const rows = db.prepare("SELECT id,project_id AS projectId,title,url,source,abstract,metadata,created_at AS createdAt FROM assistant_candidates WHERE project_id IS NOT NULL").all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const metadata = parse<Record<string, unknown>>(row.metadata, {});
      db.prepare(`INSERT OR IGNORE INTO candidate_records (id,project_id,search_run_id,provider,provider_record_id,title,authors_json,year,venue,doi,url,abstract,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(String(row.id), String(row.projectId), null, String(row.source ?? "manual"), String(metadata.sourceId ?? row.id), String(row.title), JSON.stringify(metadata.authors ?? []), typeof metadata.year === "number" ? metadata.year : null, String(metadata.venue ?? ""), typeof metadata.doi === "string" ? metadata.doi : null, row.url == null ? null : String(row.url), row.abstract == null ? null : String(row.abstract), "discovered", String(row.createdAt), String(row.createdAt));
    }
  }
}

export function ensureEvidenceSchema() {
  const db = portfolioDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS candidate_records (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,search_run_id TEXT,provider TEXT NOT NULL,provider_record_id TEXT NOT NULL,title TEXT NOT NULL,authors_json TEXT NOT NULL,year INTEGER,venue TEXT,doi TEXT,url TEXT,abstract TEXT,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS candidate_records_project ON candidate_records(project_id,status,created_at);
    CREATE TABLE IF NOT EXISTS verification_events (id TEXT PRIMARY KEY,project_id TEXT,candidate_id TEXT,work_id TEXT,provider TEXT NOT NULL,input_identifier TEXT NOT NULL,checked_at TEXT NOT NULL,matched_fields_json TEXT NOT NULL,result TEXT NOT NULL,retraction_status TEXT NOT NULL,raw_response_hash TEXT,notes TEXT);
    CREATE INDEX IF NOT EXISTS verification_events_work ON verification_events(work_id,checked_at);
    CREATE TABLE IF NOT EXISTS full_text_assets (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,work_id TEXT NOT NULL,source TEXT NOT NULL,local_path TEXT,checksum TEXT NOT NULL,mime_type TEXT NOT NULL,page_count INTEGER,status TEXT NOT NULL,rights_status TEXT NOT NULL,external_model_permission TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS full_text_assets_project_work ON full_text_assets(project_id,work_id);
    CREATE TABLE IF NOT EXISTS full_text_pages (asset_id TEXT NOT NULL REFERENCES full_text_assets(id) ON DELETE CASCADE,page_number INTEGER NOT NULL,text TEXT NOT NULL,PRIMARY KEY(asset_id,page_number));
    CREATE TABLE IF NOT EXISTS claim_evidence_links (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,claim_id TEXT NOT NULL,evidence_excerpt_id TEXT NOT NULL,relation TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS section_evidence_bundles (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,section_id TEXT NOT NULL,mode TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS structured_drafts (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,section_id TEXT NOT NULL,evidence_bundle_id TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS citation_audits (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,version_id TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS citation_audits_document ON citation_audits(project_id,document_id,checked_at);
    CREATE TABLE IF NOT EXISTS consistency_reviews (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,version_id TEXT NOT NULL,status TEXT NOT NULL,human_approval TEXT NOT NULL,payload_json TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS consistency_reviews_document ON consistency_reviews(project_id,document_id,checked_at);
    CREATE TABLE IF NOT EXISTS revision_proposals (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,section_id TEXT NOT NULL,before_text TEXT NOT NULL,after_text TEXT NOT NULL,status TEXT NOT NULL,metadata_json TEXT NOT NULL,created_at TEXT NOT NULL,applied_at TEXT);
    CREATE TABLE IF NOT EXISTS claim_coverage_reports (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,version_id TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS claim_coverage_document ON claim_coverage_reports(project_id,document_id,checked_at);
    CREATE TABLE IF NOT EXISTS quarantined_drafts (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,section_id TEXT NOT NULL,content TEXT NOT NULL,structured_json TEXT NOT NULL,coverage_report_id TEXT,citation_audit_report_id TEXT,blockers_json TEXT NOT NULL,warnings_json TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS publication_status_checks (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,work_id TEXT NOT NULL,check_state TEXT NOT NULL,status TEXT NOT NULL,payload_json TEXT NOT NULL,checked_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS publication_status_work ON publication_status_checks(project_id,work_id,checked_at);
    CREATE TABLE IF NOT EXISTS export_audit_manifests (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,version_id TEXT NOT NULL,payload_json TEXT NOT NULL,exported_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assistant_workflow_runs (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,document_id TEXT NOT NULL,section_id TEXT,intent TEXT NOT NULL,state TEXT NOT NULL,actions_json TEXT NOT NULL,idempotency_key TEXT,payload_json TEXT NOT NULL,updated_at TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS assistant_workflow_idempotency ON assistant_workflow_runs(project_id,idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE TABLE IF NOT EXISTS claim_evidence_citation_bindings (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,document_version_id TEXT NOT NULL,section_id TEXT NOT NULL,sentence_id TEXT NOT NULL,claim_id TEXT NOT NULL,evidence_excerpt_id TEXT NOT NULL,work_id TEXT NOT NULL,citation_item_id TEXT NOT NULL,relation TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(document_version_id,sentence_id,claim_id,evidence_excerpt_id,work_id,citation_item_id));
    CREATE INDEX IF NOT EXISTS claim_binding_version ON claim_evidence_citation_bindings(project_id,document_id,document_version_id);
    CREATE TABLE IF NOT EXISTS document_approvals (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,document_version_id TEXT NOT NULL,decision TEXT NOT NULL,reviewer TEXT NOT NULL,reviewed_at TEXT NOT NULL,notes TEXT,UNIQUE(project_id,document_id,document_version_id));
    CREATE TABLE IF NOT EXISTS publication_status_overrides (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,work_id TEXT NOT NULL,document_version_id TEXT NOT NULL,reviewer TEXT NOT NULL,reviewed_at TEXT NOT NULL,reason TEXT NOT NULL,decision TEXT NOT NULL,UNIQUE(project_id,work_id,document_version_id));
  `);
  runMigration({ id: MIGRATION_ID, migrate: migrateLegacyRecords });
}

export const candidateRecordSchema = z.object({
  id: z.string().optional(), projectId: z.string().min(1), searchRunId: z.string().optional(), provider: z.enum(["openalex", "crossref", "semantic-scholar", "manual"]), providerRecordId: z.string().min(1), title: z.string().min(1), authors: z.array(z.string()).default([]), year: z.number().int().optional(), venue: z.string().optional(), doi: z.string().optional(), url: z.string().url().optional(), abstract: z.string().optional(), status: z.enum(["discovered", "verification_pending", "promoted", "rejected"]).default("discovered"),
});

export function saveCandidateRecord(input: z.input<typeof candidateRecordSchema>): CandidateRecord {
  ensureEvidenceSchema(); const value = candidateRecordSchema.parse(input); const id = value.id ?? `candidate-${randomUUID()}`; const timestamp = now();
  portfolioDatabase().prepare(`INSERT INTO candidate_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at`)
    .run(id, value.projectId, value.searchRunId ?? null, value.provider, value.providerRecordId, value.title, JSON.stringify(value.authors), value.year ?? null, value.venue ?? null, value.doi ?? null, value.url ?? null, value.abstract ?? null, value.status, timestamp, timestamp);
  return { ...value, id, createdAt: timestamp, updatedAt: timestamp };
}

export function listCandidateRecords(projectId: string): CandidateRecord[] {
  ensureEvidenceSchema();
  return (portfolioDatabase().prepare("SELECT id,project_id AS projectId,search_run_id AS searchRunId,provider,provider_record_id AS providerRecordId,title,authors_json AS authors,year,venue,doi,url,abstract,status,created_at AS createdAt,updated_at AS updatedAt FROM candidate_records WHERE project_id=? ORDER BY created_at DESC").all(projectId) as Array<Record<string, unknown>>)
    .map((row) => ({ ...row, authors: parse<string[]>(row.authors, []) })) as CandidateRecord[];
}

export function getCandidateRecord(projectId: string, candidateId: string) { return listCandidateRecords(projectId).find((item) => item.id === candidateId); }
export function updateCandidateStatus(projectId: string, candidateId: string, status: CandidateRecord["status"]) { ensureEvidenceSchema(); portfolioDatabase().prepare("UPDATE candidate_records SET status=?,updated_at=? WHERE project_id=? AND id=?").run(status, now(), projectId, candidateId); return getCandidateRecord(projectId, candidateId); }

export function saveVerificationEvent(event: Omit<VerificationEvent, "id" | "checkedAt"> & Partial<Pick<VerificationEvent, "id" | "checkedAt">>): VerificationEvent {
  ensureEvidenceSchema(); const saved: VerificationEvent = { ...event, id: event.id ?? `verification-${randomUUID()}`, checkedAt: event.checkedAt ?? now() };
  portfolioDatabase().prepare("INSERT INTO verification_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(saved.id, saved.projectId ?? null, saved.candidateId ?? null, saved.workId ?? null, saved.provider, saved.inputIdentifier, saved.checkedAt, JSON.stringify(saved.matchedFields), saved.result, saved.retractionStatus, saved.rawResponseHash ?? null, saved.notes ?? null);
  return saved;
}

export function listVerificationEvents(input: { projectId?: string; workId?: string; candidateId?: string } = {}): VerificationEvent[] {
  ensureEvidenceSchema(); const where: string[] = [], args: string[] = [];
  for (const [column, value] of [["project_id", input.projectId], ["work_id", input.workId], ["candidate_id", input.candidateId]] as const) if (value) { where.push(`${column}=?`); args.push(value); }
  const rows = portfolioDatabase().prepare(`SELECT id,project_id AS projectId,candidate_id AS candidateId,work_id AS workId,provider,input_identifier AS inputIdentifier,checked_at AS checkedAt,matched_fields_json AS matchedFields,result,retraction_status AS retractionStatus,raw_response_hash AS rawResponseHash,notes FROM verification_events${where.length ? ` WHERE ${where.join(" AND ")}` : ""} ORDER BY checked_at DESC`).all(...args) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ ...row, matchedFields: parse(row.matchedFields, {}) })) as VerificationEvent[];
}

export function updateWorkVerification(projectId: string, workId: string, event: VerificationEvent) {
  ensureEvidenceSchema(); const db = portfolioDatabase(); const membership = db.prepare("SELECT 1 FROM project_works WHERE project_id=? AND work_id=?").get(projectId, workId);
  if (!membership) throw new Error("Work不属于当前项目。");
  const row = db.prepare("SELECT bibliographic_json FROM works WHERE id=?").get(workId) as { bibliographic_json: string } | undefined;
  if (!row) throw new Error("Work不存在。");
  const work = parse<Work>(row.bibliographic_json, {} as Work); work.bibliographicStatus = event.result; work.retractionStatus = event.retractionStatus; work.legacyStatusRequiresReverification = false;
  db.exec("BEGIN IMMEDIATE");
  try {
    const persistedEvent: VerificationEvent = { ...event, id: event.id || `verification-${randomUUID()}`, workId, projectId, checkedAt: event.checkedAt || now() };
    db.prepare("INSERT INTO verification_events VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(persistedEvent.id, persistedEvent.projectId ?? null, persistedEvent.candidateId ?? null, persistedEvent.workId ?? workId, persistedEvent.provider, persistedEvent.inputIdentifier, persistedEvent.checkedAt ?? now(), JSON.stringify(persistedEvent.matchedFields), persistedEvent.result, persistedEvent.retractionStatus, persistedEvent.rawResponseHash ?? null, persistedEvent.notes ?? null);
    db.prepare("UPDATE works SET bibliographic_json=?,updated_at=? WHERE id=?").run(JSON.stringify(work), now(), workId);
    db.prepare("UPDATE project_works SET verification_status=?,updated_at=? WHERE project_id=? AND work_id=?").run(event.result, now(), projectId, workId);
    const workspace = readProjectState<{ schemaVersion: number; works: Work[]; updatedAt: string }>(projectId, "workspace");
    if (workspace) { workspace.works = workspace.works.map((item) => item.id === workId ? work : item); workspace.updatedAt = now(); writeProjectState(projectId, "workspace", workspace, workspace.schemaVersion); }
    db.exec("COMMIT");
    return persistedEvent;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function saveCitationAudit(report: CitationAuditReport) { ensureEvidenceSchema(); portfolioDatabase().prepare("INSERT OR REPLACE INTO citation_audits VALUES (?,?,?,?,?,?,?)").run(report.id, report.projectId, report.documentId, report.versionId, report.status, JSON.stringify(report), report.checkedAt); return report; }
export function latestCitationAudit(projectId: string, documentId: string) { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json FROM citation_audits WHERE project_id=? AND document_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId) as { payload_json: string } | undefined; return row ? parse<CitationAuditReport>(row.payload_json, undefined as never) : undefined; }
export function citationAuditForVersion(projectId: string, documentId: string, versionId: string) { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json FROM citation_audits WHERE project_id=? AND document_id=? AND version_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId, versionId) as { payload_json: string } | undefined; return row ? parse<CitationAuditReport>(row.payload_json, undefined as never) : undefined; }
export function saveConsistencyReview(report: ConsistencyReviewReport) { ensureEvidenceSchema(); portfolioDatabase().prepare("INSERT OR REPLACE INTO consistency_reviews VALUES (?,?,?,?,?,?,?,?)").run(report.id, report.projectId, report.documentId, report.versionId, report.status, report.humanApproval, JSON.stringify(report), report.checkedAt); return report; }
export function latestConsistencyReview(projectId: string, documentId: string) { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json FROM consistency_reviews WHERE project_id=? AND document_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId) as { payload_json: string } | undefined; return row ? parse<ConsistencyReviewReport>(row.payload_json, undefined as never) : undefined; }
export function consistencyReviewForVersion(projectId: string, documentId: string, versionId: string) { ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json FROM consistency_reviews WHERE project_id=? AND document_id=? AND version_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId, versionId) as { payload_json: string } | undefined; return row ? parse<ConsistencyReviewReport>(row.payload_json, undefined as never) : undefined; }
export function updateConsistencyHumanApproval(projectId: string, documentId: string, humanApproval: ConsistencyReviewReport["humanApproval"]) {
  const current = latestConsistencyReview(projectId, documentId);
  if (!current) throw new Error("尚未运行一致性审查。");
  return saveConsistencyReview({ ...current, humanApproval, checkedAt: now() });
}

export function saveClaimEvidenceCitationBinding(binding: ClaimEvidenceCitationBinding) {
  ensureEvidenceSchema();
  portfolioDatabase().prepare("INSERT INTO claim_evidence_citation_bindings VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(binding.id, binding.projectId, binding.documentId, binding.documentVersionId, binding.sectionId, binding.sentenceId, binding.claimId, binding.evidenceExcerptId, binding.workId, binding.citationItemId, binding.relation, binding.createdAt);
  return binding;
}

export function claimEvidenceCitationBindingsForVersion(projectId: string, documentId: string, documentVersionId: string): ClaimEvidenceCitationBinding[] {
  ensureEvidenceSchema();
  const rows = portfolioDatabase().prepare("SELECT id,project_id AS projectId,document_id AS documentId,document_version_id AS documentVersionId,section_id AS sectionId,sentence_id AS sentenceId,claim_id AS claimId,evidence_excerpt_id AS evidenceExcerptId,work_id AS workId,citation_item_id AS citationItemId,relation,created_at AS createdAt FROM claim_evidence_citation_bindings WHERE project_id=? AND document_id=? AND document_version_id=? ORDER BY created_at,id").all(projectId, documentId, documentVersionId) as Array<Record<string, unknown>>;
  return rows.map((row) => row as unknown as ClaimEvidenceCitationBinding);
}

export function saveDocumentApproval(input: Omit<HumanApproval, "id" | "reviewedAt"> & Partial<Pick<HumanApproval, "id" | "reviewedAt">>) {
  ensureEvidenceSchema();
  const reviewer = input.reviewer.trim(); if (!reviewer) throw new Error("审批 reviewer 不能为空。");
  const approval: HumanApproval = { ...input, id: input.id ?? `approval-${randomUUID()}`, reviewer, reviewedAt: input.reviewedAt ?? now() };
  portfolioDatabase().prepare("INSERT INTO document_approvals VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id,document_id,document_version_id) DO UPDATE SET id=excluded.id,decision=excluded.decision,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at,notes=excluded.notes").run(approval.id, approval.projectId, approval.documentId, approval.documentVersionId, approval.decision, approval.reviewer, approval.reviewedAt, approval.notes ?? null);
  return approval;
}

export function documentApprovalForVersion(projectId: string, documentId: string, documentVersionId: string): HumanApproval | undefined {
  ensureEvidenceSchema();
  return portfolioDatabase().prepare("SELECT id,project_id AS projectId,document_id AS documentId,document_version_id AS documentVersionId,decision,reviewer,reviewed_at AS reviewedAt,notes FROM document_approvals WHERE project_id=? AND document_id=? AND document_version_id=?").get(projectId, documentId, documentVersionId) as HumanApproval | undefined;
}

export function savePublicationStatusOverride(input: Omit<PublicationStatusOverride, "id" | "reviewedAt" | "decision"> & Partial<Pick<PublicationStatusOverride, "id" | "reviewedAt">>) {
  ensureEvidenceSchema(); const latest = latestPublicationStatusCheck(input.projectId, input.workId);
  if (!latest || latest.checkState !== "checked" || latest.status !== "unknown") throw new Error("只有 checked + unknown publication status 可以人工确认；撤稿或关注表达不能放行。");
  const reviewer = input.reviewer.trim(), reason = input.reason.trim(); if (!reviewer || !reason) throw new Error("publication status override 必须包含 reviewer 和 reason。");
  const override: PublicationStatusOverride = { ...input, id: input.id ?? `publication-override-${randomUUID()}`, reviewer, reason, reviewedAt: input.reviewedAt ?? now(), decision: "allow_unknown_for_this_version" };
  portfolioDatabase().prepare("INSERT INTO publication_status_overrides VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(project_id,work_id,document_version_id) DO UPDATE SET id=excluded.id,reviewer=excluded.reviewer,reviewed_at=excluded.reviewed_at,reason=excluded.reason,decision=excluded.decision").run(override.id, override.projectId, override.workId, override.documentVersionId, override.reviewer, override.reviewedAt, override.reason, override.decision);
  return override;
}

export function publicationStatusOverrideForVersion(projectId: string, workId: string, documentVersionId: string): PublicationStatusOverride | undefined {
  ensureEvidenceSchema(); return portfolioDatabase().prepare("SELECT id,project_id AS projectId,work_id AS workId,document_version_id AS documentVersionId,reviewer,reviewed_at AS reviewedAt,reason,decision FROM publication_status_overrides WHERE project_id=? AND work_id=? AND document_version_id=?").get(projectId, workId, documentVersionId) as PublicationStatusOverride | undefined;
}

export function responseHash(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
export function stableCandidateId(projectId: string, provider: string, providerRecordId: string) { return `candidate-${createHash("sha256").update(`${projectId}|${provider}|${providerRecordId}`).digest("hex").slice(0, 20)}`; }

export function createRevisionProposal(input: { projectId: string; documentId: string; sectionId: string; beforeText: string; afterText: string; metadata?: Record<string, unknown> }) { ensureEvidenceSchema(); const item = { id: `revision-${randomUUID()}`, ...input, status: "proposed", metadata: input.metadata ?? {}, createdAt: now() }; portfolioDatabase().prepare("INSERT INTO revision_proposals VALUES (?,?,?,?,?,?,?,?,?,?)").run(item.id, item.projectId, item.documentId, item.sectionId, item.beforeText, item.afterText, item.status, JSON.stringify(item.metadata), item.createdAt, null); return item; }
export function getRevisionProposal(id: string, projectId?: string) { ensureEvidenceSchema(); const row = portfolioDatabase().prepare(`SELECT id,project_id AS projectId,document_id AS documentId,section_id AS sectionId,before_text AS beforeText,after_text AS afterText,status,metadata_json AS metadata,created_at AS createdAt,applied_at AS appliedAt FROM revision_proposals WHERE id=?${projectId ? " AND project_id=?" : ""}`).get(...([id, ...(projectId ? [projectId] : [])])) as Record<string, unknown> | undefined; return row ? { ...row, metadata: parse(row.metadata, {}) } : undefined; }
export function markRevisionApplied(id: string) { ensureEvidenceSchema(); portfolioDatabase().prepare("UPDATE revision_proposals SET status='applied',applied_at=? WHERE id=? AND status='proposed'").run(now(), id); }

export function saveQuarantinedDraft(input: Omit<QuarantinedDraft, "id" | "createdAt"> & Partial<Pick<QuarantinedDraft, "id" | "createdAt">>) {
  ensureEvidenceSchema();
  const draft: QuarantinedDraft = { ...input, id: input.id ?? `quarantine-${randomUUID()}`, createdAt: input.createdAt ?? now() };
  portfolioDatabase().prepare("INSERT INTO quarantined_drafts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(draft.id, draft.projectId, draft.documentId, draft.sectionId, draft.content, JSON.stringify(draft.structuredDraft), draft.coverageReportId ?? null, draft.citationAuditReportId ?? null, JSON.stringify(draft.blockers), JSON.stringify(draft.warnings), draft.status, draft.createdAt);
  return draft;
}

export function listQuarantinedDrafts(projectId: string, documentId?: string) {
  ensureEvidenceSchema();
  const sql = documentId
    ? "SELECT id,project_id AS projectId,document_id AS documentId,section_id AS sectionId,content,structured_json AS structuredDraft,coverage_report_id AS coverageReportId,citation_audit_report_id AS citationAuditReportId,blockers_json AS blockers,warnings_json AS warnings,status,created_at AS createdAt FROM quarantined_drafts WHERE project_id=? AND document_id=? ORDER BY created_at DESC"
    : "SELECT id,project_id AS projectId,document_id AS documentId,section_id AS sectionId,content,structured_json AS structuredDraft,coverage_report_id AS coverageReportId,citation_audit_report_id AS citationAuditReportId,blockers_json AS blockers,warnings_json AS warnings,status,created_at AS createdAt FROM quarantined_drafts WHERE project_id=? ORDER BY created_at DESC";
  const rows = (documentId ? portfolioDatabase().prepare(sql).all(projectId, documentId) : portfolioDatabase().prepare(sql).all(projectId)) as Array<Record<string, unknown>>;
  return rows.map((row) => ({ ...row, structuredDraft: parse(row.structuredDraft, {}), blockers: parse(row.blockers, []), warnings: parse(row.warnings, []) })) as unknown as QuarantinedDraft[];
}

export function savePublicationStatusCheck(input: Omit<import("./types").PublicationStatusCheckResult, "id"> & { id?: string }) {
  ensureEvidenceSchema(); const result = { ...input, id: input.id ?? `publication-check-${randomUUID()}` };
  if (!result.projectId || !result.workId) throw new Error("publication status check 必须绑定 projectId 和 workId。");
  portfolioDatabase().prepare("INSERT INTO publication_status_checks VALUES (?,?,?,?,?,?,?)").run(result.id, result.projectId, result.workId, result.checkState, result.status, JSON.stringify(result), result.checkedAt);
  return result;
}

export function latestPublicationStatusCheck(projectId: string, workId: string): import("./types").PublicationStatusCheckResult | undefined {
  ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM publication_status_checks WHERE project_id=? AND work_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, workId) as { payload?: string } | undefined;
  return row?.payload ? parse<import("./types").PublicationStatusCheckResult>(row.payload, undefined as never) : undefined;
}

export function saveExportAuditManifest(manifest: import("./types").ExportAuditManifest) {
  ensureEvidenceSchema(); const id = manifest.id ?? `export-manifest-${randomUUID()}`; const saved = { ...manifest, id };
  portfolioDatabase().prepare("INSERT INTO export_audit_manifests VALUES (?,?,?,?,?,?)").run(id, manifest.projectId, manifest.documentId, manifest.versionId, JSON.stringify(saved), manifest.exportedAt);
  return saved;
}

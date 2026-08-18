import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { z } from "zod";
import { seedWorkspace } from "@/data/seed";
import type { Project, WorkspaceData, Work } from "./types";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

let database: import("node:sqlite").DatabaseSync | undefined;
let openedPath = "";

function databasePath() {
  return path.join(process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), ".local"), "workbench.sqlite");
}

function db() {
  const nextPath = databasePath();
  if (database && openedPath === nextPath) return database;
  database?.close();
  mkdirSync(path.dirname(nextPath), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(nextPath);
  openedPath = nextPath;
  database.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;");
  return database;
}

const now = () => new Date().toISOString();
const json = (value: unknown) => JSON.stringify(value ?? {});
function parse<T>(value: unknown, fallback: T): T {
  try { return value == null ? fallback : JSON.parse(String(value)) as T; } catch { return fallback; }
}

export type ProjectStatus = "active" | "archived";
export type ProjectPolicy = {
  lockedDesignStatements: string[];
  outcomeInterpretation: string;
  forbiddenClaims: string[];
  resultsPolicy: "real-analysis-required";
};

export interface ProjectRecord extends Project {
  slug: string;
  status: ProjectStatus;
  sourceCandidateId?: string;
  policy: ProjectPolicy;
  createdAt: string;
  updatedAt: string;
}

export const projectCreateSchema = z.object({
  titleEn: z.string().trim().min(3).max(1000),
  titleZh: z.string().trim().min(1).max(1000),
  field: z.string().trim().min(1).max(300),
  context: z.string().max(2000).default("待明确"),
  institution: z.string().max(300).default("待指定澳大利亚大学"),
  primaryOutcome: z.string().max(500).default("待明确"),
  secondaryOutcome: z.string().max(500).default("待明确"),
  sourceCandidateId: z.string().max(120).optional(),
}).strict();

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;

function slugify(value: string) {
  const ascii = value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64);
  return ascii || `project-${createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

function defaultPolicy(project: Project): ProjectPolicy {
  return {
    lockedDesignStatements: [],
    outcomeInterpretation: `${project.primaryOutcome} is the registered primary outcome and must not be described as a realised behavioural result unless supported by completed real analysis.`,
    forbiddenClaims: ["invented citations", "invented sample sizes", "invented statistical results", "unobserved findings"],
    resultsPolicy: "real-analysis-required",
  };
}

function rowToProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id), slug: String(row.slug), titleEn: String(row.titleEn), titleZh: String(row.titleZh),
    field: String(row.field), context: String(row.context), institution: String(row.institution),
    primaryOutcome: String(row.primaryOutcome), secondaryOutcome: String(row.secondaryOutcome),
    designLanguage: "中文", writingLanguage: "English", citationStyle: "APA 7", version: String(row.version),
    status: row.status as ProjectStatus, sourceCandidateId: row.sourceCandidateId ? String(row.sourceCandidateId) : undefined,
    policy: parse<ProjectPolicy>(row.policyJson, defaultPolicy(row as unknown as Project)),
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
  };
}

function hasColumn(table: string, column: string) {
  const rows = db().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumnIfMissing(table: string, column: string, definition: string) {
  const exists = db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (exists && !hasColumn(table, column)) db().exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function upsertGlobalWork(work: Work, projectId: string) {
  db().prepare(`INSERT INTO works (id, doi, title, bibliographic_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET bibliographic_json=excluded.bibliographic_json,updated_at=excluded.updated_at`)
    .run(work.id, work.doi?.toLowerCase() ?? null, work.title, json(work), now(), now());
  db().prepare(`INSERT OR IGNORE INTO project_works (project_id, work_id, role, relevance, verification_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(projectId, work.id, work.group, work.relevance, work.bibliographicStatus ?? "unverified", now(), now());
}

export function registerProjectWork(projectId: string, work: Work) {
  ensurePortfolioSchema();
  if (!getProject(projectId)) throw new Error("项目不存在。");
  upsertGlobalWork(work, projectId);
}

function migrateLegacyData() {
  const count = db().prepare("SELECT COUNT(*) AS count FROM projects").get() as { count: number };
  if (count.count > 0) return;
  const legacyRow = db().prepare("SELECT value FROM app_state WHERE key='workspace'").get() as { value: string } | undefined;
  const workspace = parse<WorkspaceData>(legacyRow?.value, JSON.parse(JSON.stringify(seedWorkspace)) as WorkspaceData);
  const project = workspace.project;
  const timestamp = now();
  const policy = defaultPolicy(project);
  if (project.id === "project-ai-c2c") {
    policy.lockedDesignStatements = workspace.experiments.map((experiment) => `${experiment.name}: ${experiment.design}; ${experiment.primaryTest}`);
    policy.outcomeInterpretation = `${project.primaryOutcome} and ${project.secondaryOutcome} are intention proxies, not actual transactions or sales conversion.`;
    policy.forbiddenClaims.push("seller-contact intention described as actual conversion");
  }
  db().prepare(`INSERT INTO projects (id,slug,title_en,title_zh,field,context,institution,primary_outcome,secondary_outcome,version,status,source_candidate_id,policy_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(project.id, slugify(project.titleEn), project.titleEn, project.titleZh, project.field, project.context, project.institution, project.primaryOutcome, project.secondaryOutcome, project.version, "active", null, json(policy), timestamp, timestamp);
  db().prepare("INSERT INTO project_state (project_id,key,schema_version,value,updated_at) VALUES (?,?,?,?,?)")
    .run(project.id, "workspace", workspace.schemaVersion, json(workspace), timestamp);
  for (const key of ["research_plan", "material_registry", "dataset_registry", "analysis_runs", "review_workflow", "institution_profile", "evidence_excerpts"]) {
    const row = db().prepare("SELECT value,updated_at FROM app_state WHERE key=?").get(key) as { value: string; updated_at: string } | undefined;
    if (row) db().prepare("INSERT OR IGNORE INTO project_state (project_id,key,schema_version,value,updated_at) VALUES (?,?,?,?,?)").run(project.id, key, 1, row.value, row.updated_at);
  }
  workspace.works.forEach((work) => upsertGlobalWork(work, project.id));
  if (db().prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='assistant_conversations'").get()) {
    addColumnIfMissing("assistant_conversations", "project_id", "TEXT");
    addColumnIfMissing("assistant_jobs", "project_id", "TEXT");
    db().prepare("UPDATE assistant_conversations SET project_id=? WHERE project_id IS NULL").run(project.id);
    db().prepare("UPDATE assistant_jobs SET project_id=? WHERE project_id IS NULL").run(project.id);
  }
  const manuscript = db().prepare("SELECT value,updated_at FROM app_state WHERE key='manuscript'").get() as { value: string; updated_at: string } | undefined;
  if (manuscript) {
    const parsed = parse<Record<string, unknown>>(manuscript.value, {});
    const documentId = typeof parsed.id === "string" ? parsed.id : `document-${randomUUID()}`;
    db().prepare(`INSERT OR IGNORE INTO documents (id,project_id,document_type,mode,title,status,target_venue,content_json,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(documentId, project.id, "confirmation-proposal", "prospective", String(parsed.title ?? project.titleEn), String(parsed.status ?? "draft"), String(parsed.targetUniversity ?? ""), manuscript.value, String(parsed.createdAt ?? timestamp), manuscript.updated_at);
    const versions = db().prepare("SELECT value FROM app_state WHERE key='manuscript_versions'").get() as { value: string } | undefined;
    for (const version of parse<Array<Record<string, unknown>>>(versions?.value, [])) {
      db().prepare(`INSERT OR IGNORE INTO document_versions (id,document_id,section_id,version_number,payload_json,created_at)
        VALUES (?,?,?,?,?,?)`).run(String(version.id), documentId, String(version.sectionId ?? ""), Number(version.versionNumber ?? 1), json(version), String(version.createdAt ?? timestamp));
    }
  }
}

export function ensurePortfolioSchema() {
  db().exec(`
    CREATE TABLE IF NOT EXISTS app_state (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY,applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,slug TEXT NOT NULL UNIQUE,title_en TEXT NOT NULL,title_zh TEXT NOT NULL,field TEXT NOT NULL,context TEXT NOT NULL,
      institution TEXT NOT NULL,primary_outcome TEXT NOT NULL,secondary_outcome TEXT NOT NULL,version TEXT NOT NULL,status TEXT NOT NULL,
      source_candidate_id TEXT,policy_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_state (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,key TEXT NOT NULL,schema_version INTEGER NOT NULL,value TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id,key)
    );
    CREATE TABLE IF NOT EXISTS works (id TEXT PRIMARY KEY,doi TEXT,title TEXT NOT NULL,bibliographic_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS works_doi_unique ON works(doi) WHERE doi IS NOT NULL AND doi <> '';
    CREATE TABLE IF NOT EXISTS project_works (
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
      role TEXT NOT NULL,relevance TEXT NOT NULL,verification_status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
      PRIMARY KEY(project_id,work_id)
    );
    CREATE TABLE IF NOT EXISTS topic_batches (
      id TEXT PRIMARY KEY,input_mode TEXT NOT NULL,brief TEXT NOT NULL,requested_count INTEGER NOT NULL,status TEXT NOT NULL,profile_id TEXT,
      created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS topic_candidates (
      id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES topic_batches(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,
      status TEXT NOT NULL,scores_json TEXT NOT NULL,risks_json TEXT NOT NULL,report_json TEXT NOT NULL,project_id TEXT REFERENCES projects(id),created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS topic_candidates_batch ON topic_candidates(batch_id,created_at);
    CREATE TABLE IF NOT EXISTS paper_concepts (
      id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,central_question TEXT NOT NULL,
      contribution TEXT NOT NULL,linked_study_ids TEXT NOT NULL,linked_hypothesis_ids TEXT NOT NULL,target_journal TEXT NOT NULL,status TEXT NOT NULL,
      overlap_warning TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,document_type TEXT NOT NULL,mode TEXT NOT NULL,
      title TEXT NOT NULL,status TEXT NOT NULL,target_venue TEXT NOT NULL,content_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_project ON documents(project_id,updated_at);
    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,section_id TEXT NOT NULL,version_number INTEGER NOT NULL,
      payload_json TEXT NOT NULL,created_at TEXT NOT NULL
    );
  `);
  addColumnIfMissing("generation_audit", "project_id", "TEXT");
  addColumnIfMissing("generation_audit", "document_id", "TEXT");
  migrateLegacyData();
  db().prepare("INSERT OR IGNORE INTO schema_migrations (id,applied_at) VALUES (?,?)").run("portfolio-v1", now());
}

export function listProjects(includeArchived = false): ProjectRecord[] {
  ensurePortfolioSchema();
  const sql = `SELECT id,slug,title_en AS titleEn,title_zh AS titleZh,field,context,institution,primary_outcome AS primaryOutcome,
    secondary_outcome AS secondaryOutcome,version,status,source_candidate_id AS sourceCandidateId,policy_json AS policyJson,created_at AS createdAt,updated_at AS updatedAt
    FROM projects ${includeArchived ? "" : "WHERE status='active'"} ORDER BY updated_at DESC`;
  return (db().prepare(sql).all() as Array<Record<string, unknown>>).map(rowToProject);
}

export function getProject(projectId: string): ProjectRecord | undefined {
  ensurePortfolioSchema();
  const row = db().prepare(`SELECT id,slug,title_en AS titleEn,title_zh AS titleZh,field,context,institution,primary_outcome AS primaryOutcome,
    secondary_outcome AS secondaryOutcome,version,status,source_candidate_id AS sourceCandidateId,policy_json AS policyJson,created_at AS createdAt,updated_at AS updatedAt FROM projects WHERE id=?`).get(projectId) as Record<string, unknown> | undefined;
  return row ? rowToProject(row) : undefined;
}

export function getDefaultProjectId() {
  const project = listProjects()[0] ?? listProjects(true)[0];
  if (!project) throw new Error("没有可用研究项目。");
  return project.id;
}

function uniqueSlug(title: string) {
  const base = slugify(title);
  let candidate = base;
  let suffix = 2;
  while (db().prepare("SELECT 1 FROM projects WHERE slug=?").get(candidate)) candidate = `${base.slice(0, 58)}-${suffix++}`;
  return candidate;
}

export function createProject(input: z.input<typeof projectCreateSchema>): ProjectRecord {
  ensurePortfolioSchema();
  const parsed = projectCreateSchema.parse(input);
  const project: Project = {
    id: `project-${randomUUID()}`, titleEn: parsed.titleEn, titleZh: parsed.titleZh, field: parsed.field, context: parsed.context,
    institution: parsed.institution, primaryOutcome: parsed.primaryOutcome, secondaryOutcome: parsed.secondaryOutcome,
    designLanguage: "中文", writingLanguage: "English", citationStyle: "APA 7", version: "v0.1",
  };
  const timestamp = now();
  db().prepare(`INSERT INTO projects (id,slug,title_en,title_zh,field,context,institution,primary_outcome,secondary_outcome,version,status,source_candidate_id,policy_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(project.id, uniqueSlug(project.titleEn), project.titleEn, project.titleZh, project.field, project.context, project.institution, project.primaryOutcome, project.secondaryOutcome, project.version, "active", parsed.sourceCandidateId ?? null, json(defaultPolicy(project)), timestamp, timestamp);
  const workspace: WorkspaceData = { schemaVersion: seedWorkspace.schemaVersion, project, confirmation: JSON.parse(JSON.stringify(seedWorkspace.confirmation)), works: [], theories: [], constructs: [], experiments: [], claims: [], novelty: [], updatedAt: timestamp };
  writeProjectState(project.id, "workspace", workspace, workspace.schemaVersion);
  return getProject(project.id)!;
}

export function updateProject(projectId: string, patch: Partial<Pick<ProjectRecord, "titleEn" | "titleZh" | "field" | "context" | "institution" | "primaryOutcome" | "secondaryOutcome" | "status" | "policy">>) {
  const current = getProject(projectId);
  if (!current) throw new Error("项目不存在。");
  const next = { ...current, ...patch, updatedAt: now() };
  db().prepare(`UPDATE projects SET title_en=?,title_zh=?,field=?,context=?,institution=?,primary_outcome=?,secondary_outcome=?,status=?,policy_json=?,updated_at=? WHERE id=?`)
    .run(next.titleEn, next.titleZh, next.field, next.context, next.institution, next.primaryOutcome, next.secondaryOutcome, next.status, json(next.policy), next.updatedAt, projectId);
  const workspace = readProjectState<WorkspaceData>(projectId, "workspace");
  if (workspace) writeProjectState(projectId, "workspace", { ...workspace, project: { ...workspace.project, titleEn: next.titleEn, titleZh: next.titleZh, field: next.field, context: next.context, institution: next.institution, primaryOutcome: next.primaryOutcome, secondaryOutcome: next.secondaryOutcome }, updatedAt: next.updatedAt }, workspace.schemaVersion);
  return getProject(projectId)!;
}

export function readProjectState<T>(projectId: string, key: string): T | undefined {
  ensurePortfolioSchema();
  if (!getProject(projectId)) throw new Error("项目不存在。");
  const row = db().prepare("SELECT value FROM project_state WHERE project_id=? AND key=?").get(projectId, key) as { value: string } | undefined;
  return row ? parse<T>(row.value, undefined as T) : undefined;
}

export function writeProjectState(projectId: string, key: string, value: unknown, schemaVersion = 1) {
  ensurePortfolioSchema();
  db().prepare(`INSERT INTO project_state (project_id,key,schema_version,value,updated_at) VALUES (?,?,?,?,?)
    ON CONFLICT(project_id,key) DO UPDATE SET schema_version=excluded.schema_version,value=excluded.value,updated_at=excluded.updated_at`)
    .run(projectId, key, schemaVersion, json(value), now());
}

export type TopicBatch = { id: string; inputMode: "expand" | "evaluate-only"; brief: string; requestedCount: number; status: string; profileId?: string; createdAt: string; updatedAt: string };
export type TopicCandidate = { id: string; batchId: string; title: string; description: string; status: string; scores: Record<string, number>; risks: string[]; report: Record<string, unknown>; projectId?: string; createdAt: string; updatedAt: string };

export const topicBatchInputSchema = z.object({
  inputMode: z.enum(["expand", "evaluate-only"]), brief: z.string().trim().min(3).max(30_000),
  requestedCount: z.number().int().min(3).max(8).default(5), seedTopics: z.array(z.string().trim().min(3).max(1000)).max(20).default([]),
  profileId: z.string().max(120).optional(),
}).superRefine((value, ctx) => { if (value.inputMode === "evaluate-only" && value.seedTopics.length < 2) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "统一评估至少需要两个候选题目。" }); });

export function createTopicBatch(input: z.input<typeof topicBatchInputSchema>) {
  ensurePortfolioSchema();
  const parsed = topicBatchInputSchema.parse(input);
  const id = `batch-${randomUUID()}`;
  const timestamp = now();
  db().prepare("INSERT INTO topic_batches VALUES (?,?,?,?,?,?,?,?)").run(id, parsed.inputMode, parsed.brief, parsed.requestedCount, "queued", parsed.profileId ?? null, timestamp, timestamp);
  for (const title of parsed.seedTopics) addTopicCandidate(id, { title, description: "用户提供的候选主题", status: "pending" });
  return getTopicBatch(id)!;
}

export function addTopicCandidate(batchId: string, input: { title: string; description?: string; status?: string; scores?: Record<string, number>; risks?: string[]; report?: Record<string, unknown> }) {
  const id = `candidate-${randomUUID()}`, timestamp = now();
  db().prepare("INSERT INTO topic_candidates VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(id, batchId, input.title, input.description ?? "", input.status ?? "evaluated", json(input.scores ?? {}), json(input.risks ?? []), json(input.report ?? {}), null, timestamp, timestamp);
  return getTopicCandidate(id)!;
}

export function updateTopicBatch(batchId: string, patch: { status: string }) {
  db().prepare("UPDATE topic_batches SET status=?,updated_at=? WHERE id=?").run(patch.status, now(), batchId);
  return getTopicBatch(batchId);
}

export function updateTopicCandidate(candidateId: string, patch: Partial<Pick<TopicCandidate, "title" | "description" | "status" | "scores" | "risks" | "report" | "projectId">>) {
  const current = getTopicCandidate(candidateId); if (!current) throw new Error("候选主题不存在。");
  const next = { ...current, ...patch };
  db().prepare("UPDATE topic_candidates SET title=?,description=?,status=?,scores_json=?,risks_json=?,report_json=?,project_id=?,updated_at=? WHERE id=?")
    .run(next.title, next.description, next.status, json(next.scores), json(next.risks), json(next.report), next.projectId ?? null, now(), candidateId);
  return getTopicCandidate(candidateId)!;
}

function batchRow(row: Record<string, unknown>): TopicBatch { return { id: String(row.id), inputMode: row.inputMode as TopicBatch["inputMode"], brief: String(row.brief), requestedCount: Number(row.requestedCount), status: String(row.status), profileId: row.profileId ? String(row.profileId) : undefined, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }; }
function candidateRow(row: Record<string, unknown>): TopicCandidate { return { id: String(row.id), batchId: String(row.batchId), title: String(row.title), description: String(row.description), status: String(row.status), scores: parse(row.scoresJson, {}), risks: parse(row.risksJson, []), report: parse(row.reportJson, {}), projectId: row.projectId ? String(row.projectId) : undefined, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }; }
export function listTopicBatches() { ensurePortfolioSchema(); return (db().prepare("SELECT id,input_mode AS inputMode,brief,requested_count AS requestedCount,status,profile_id AS profileId,created_at AS createdAt,updated_at AS updatedAt FROM topic_batches ORDER BY created_at DESC").all() as Array<Record<string, unknown>>).map(batchRow); }
export function getTopicBatch(id: string) { ensurePortfolioSchema(); const row = db().prepare("SELECT id,input_mode AS inputMode,brief,requested_count AS requestedCount,status,profile_id AS profileId,created_at AS createdAt,updated_at AS updatedAt FROM topic_batches WHERE id=?").get(id) as Record<string, unknown> | undefined; return row ? batchRow(row) : undefined; }
export function listTopicCandidates(batchId: string) { ensurePortfolioSchema(); return (db().prepare("SELECT id,batch_id AS batchId,title,description,status,scores_json AS scoresJson,risks_json AS risksJson,report_json AS reportJson,project_id AS projectId,created_at AS createdAt,updated_at AS updatedAt FROM topic_candidates WHERE batch_id=? ORDER BY created_at").all(batchId) as Array<Record<string, unknown>>).map(candidateRow).sort((left, right) => (right.scores.overall ?? 0) - (left.scores.overall ?? 0)); }
export function getTopicCandidate(id: string) { ensurePortfolioSchema(); const row = db().prepare("SELECT id,batch_id AS batchId,title,description,status,scores_json AS scoresJson,risks_json AS risksJson,report_json AS reportJson,project_id AS projectId,created_at AS createdAt,updated_at AS updatedAt FROM topic_candidates WHERE id=?").get(id) as Record<string, unknown> | undefined; return row ? candidateRow(row) : undefined; }

export function promoteTopicCandidate(candidateId: string, overrides: Partial<ProjectCreateInput> = {}) {
  const candidate = getTopicCandidate(candidateId); if (!candidate) throw new Error("候选主题不存在。");
  if (candidate.projectId) return getProject(candidate.projectId)!;
  if (candidate.report.ethicsGate === "block") throw new Error("该候选存在伦理或数据可行性阻断，请修订并重新评估后再立项。");
  const report = candidate.report;
  const project = createProject({
    titleEn: String(overrides.titleEn ?? report.titleEn ?? candidate.title), titleZh: String(overrides.titleZh ?? report.titleZh ?? candidate.title),
    field: String(overrides.field ?? report.field ?? "待明确研究领域"), context: String(overrides.context ?? report.context ?? "待明确"),
    institution: String(overrides.institution ?? "待指定澳大利亚大学"), primaryOutcome: String(overrides.primaryOutcome ?? report.primaryOutcome ?? "待明确"),
    secondaryOutcome: String(overrides.secondaryOutcome ?? report.secondaryOutcome ?? "待明确"), sourceCandidateId: candidate.id,
  });
  updateTopicCandidate(candidate.id, { status: "promoted", projectId: project.id });
  return project;
}

export function portfolioDatabase() { ensurePortfolioSchema(); return db(); }
export const portfolioDatabaseForTests = portfolioDatabase;

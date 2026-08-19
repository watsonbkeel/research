import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { closePortfolioDatabase, portfolioDatabase, portfolioDatabaseFile, readProjectState } from "./portfolio";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

export interface MigrationSnapshot {
  projects: number; documents: number; document_versions: number; sections: number; candidates: number; works: number; verification_events: number; publication_status_events: number; claims: number; claim_evidence_links: number; evidence_excerpts: number; full_text_assets: number; assistant_conversations: number; assistant_jobs: number; assistant_workflow_runs: number; citation_audits: number; consistency_reviews: number; claim_coverage_reports: number; approvals: number;
}

function tableCount(table: string) {
  const db = portfolioDatabase(); const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) return 0;
  return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

function projectStateArrayCount(key: string) {
  const projects = portfolioDatabase().prepare("SELECT id FROM projects").all() as Array<{ id: string }>;
  return projects.reduce((total, project) => { const value = readProjectState<unknown>(project.id, key); return total + (Array.isArray(value) ? value.length : key === "workspace" && value && typeof value === "object" && Array.isArray((value as { claims?: unknown }).claims) ? (value as { claims: unknown[] }).claims.length : 0); }, 0);
}

export function migrationSnapshot(): MigrationSnapshot {
  return {
    projects: tableCount("projects"), documents: tableCount("documents"), document_versions: tableCount("document_snapshots") + tableCount("document_versions"),
    sections: tableCount("document_versions"), candidates: tableCount("candidate_records"), works: tableCount("works"), verification_events: tableCount("verification_events"),
    publication_status_events: tableCount("publication_status_checks"), claims: tableCount("claims") || projectStateArrayCount("workspace"), claim_evidence_links: tableCount("claim_evidence_links"),
    evidence_excerpts: tableCount("evidence_excerpts") || projectStateArrayCount("evidence_excerpts"), full_text_assets: tableCount("full_text_assets"), assistant_conversations: tableCount("assistant_conversations"),
    assistant_jobs: tableCount("assistant_jobs"), assistant_workflow_runs: tableCount("assistant_workflow_runs"), citation_audits: tableCount("citation_audits"),
    consistency_reviews: tableCount("consistency_reviews"), claim_coverage_reports: tableCount("claim_coverage_reports"), approvals: tableCount("document_approvals") + tableCount("human_approvals"),
  };
}

export function createCheckpointedBackup(migrationId: string) {
  const db = portfolioDatabase(); db.exec("PRAGMA wal_checkpoint(FULL)");
  const row = db.prepare("PRAGMA database_list").all().find((item: unknown) => typeof item === "object" && item !== null && (item as { name?: string }).name === "main") as { file?: string } | undefined;
  if (!row?.file || !existsSync(row.file)) return undefined;
  const backupDirectory = path.join(path.dirname(row.file), "backups"); mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backupPath = path.join(backupDirectory, `${path.basename(row.file)}.pre-${migrationId}-${Date.now()}.sqlite`); const escaped = backupPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escaped}'`);
  const checksum = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
  const validation = new DatabaseSync(backupPath, { readOnly: true }); const integrity = String((validation.prepare("PRAGMA integrity_check").get() as Record<string, unknown>)["integrity_check"] ?? "unknown"); validation.close(); if (integrity !== "ok") throw new Error(`Backup integrity_check failed: ${integrity}`);
  return { backupPath, checksum };
}

export function runMigration(input: { id: string; migrate: () => void }) {
  const db = portfolioDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS migration_runs (id TEXT PRIMARY KEY,migration_id TEXT NOT NULL,status TEXT NOT NULL,backup_path TEXT,backup_checksum TEXT,before_counts TEXT NOT NULL,after_counts TEXT,integrity_result TEXT,error TEXT,created_at TEXT NOT NULL,completed_at TEXT)");
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(input.id)) return { applied: false, reason: "already-applied" as const };
  const before = migrationSnapshot(); const backup = createCheckpointedBackup(input.id); const runId = `migration-run-${randomUUID()}`; const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO migration_runs (id,migration_id,status,backup_path,backup_checksum,before_counts,created_at) VALUES (?,?,?,?,?,?,?)").run(runId, input.id, "running", backup?.backupPath ?? null, backup?.checksum ?? null, JSON.stringify(before), createdAt);
  db.exec("BEGIN IMMEDIATE");
  try {
    input.migrate();
    const integrity = String((db.prepare("PRAGMA integrity_check").get() as Record<string, unknown>)["integrity_check"] ?? "unknown");
    if (integrity !== "ok") throw new Error(`SQLite integrity_check failed: ${integrity}`);
    db.prepare("INSERT INTO schema_migrations (id,applied_at) VALUES (?,?)").run(input.id, new Date().toISOString());
    db.exec("COMMIT");
    const after = migrationSnapshot(); db.prepare("UPDATE migration_runs SET status='completed',after_counts=?,integrity_result=?,completed_at=? WHERE id=?").run(JSON.stringify(after), integrity, new Date().toISOString(), runId);
    return { applied: true, backup, before, after, integrity };
  } catch (error) {
    db.exec("ROLLBACK"); const message = error instanceof Error ? error.message : String(error); db.prepare("UPDATE migration_runs SET status='failed',error=?,completed_at=? WHERE id=?").run(message, new Date().toISOString(), runId);
    if (backup) {
      const databaseFile = portfolioDatabaseFile(); const failureLog = `${backup.backupPath}.failure.json`; writeFileSync(failureLog, JSON.stringify({ migrationId: input.id, runId, error: message, failedAt: new Date().toISOString(), backupChecksum: backup.checksum }, null, 2), { mode: 0o600 });
      closePortfolioDatabase(); copyFileSync(backup.backupPath, databaseFile); const restored = portfolioDatabase(); const integrity = String((restored.prepare("PRAGMA integrity_check").get() as Record<string, unknown>)["integrity_check"] ?? "unknown"); const schemaStillOld = !restored.prepare("SELECT 1 FROM schema_migrations WHERE id=?").get(input.id); if (integrity !== "ok" || !schemaStillOld) throw new Error(`Migration failed and backup restore validation failed: integrity=${integrity}, schemaStillOld=${schemaStillOld}`);
    }
    throw new Error(`Migration ${input.id} failed and was rolled back${backup ? "; verified backup restored" : ""}: ${message}`);
  }
}

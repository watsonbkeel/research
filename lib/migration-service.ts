import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { portfolioDatabase } from "./portfolio";

export interface MigrationSnapshot {
  projects: number; documents: number; works: number; candidates: number; claims: number; excerpts: number; versions: number; conversations: number; jobs: number;
}

function tableCount(table: string) {
  const db = portfolioDatabase(); const exists = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!exists) return 0;
  return Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count);
}

export function migrationSnapshot(): MigrationSnapshot {
  return { projects: tableCount("projects"), documents: tableCount("documents"), works: tableCount("works"), candidates: tableCount("candidate_records"), claims: tableCount("claim_evidence_links"), excerpts: tableCount("full_text_assets"), versions: tableCount("document_snapshots") + tableCount("document_versions"), conversations: tableCount("assistant_conversations"), jobs: tableCount("assistant_jobs") };
}

export function createCheckpointedBackup(migrationId: string) {
  const db = portfolioDatabase(); db.exec("PRAGMA wal_checkpoint(FULL)");
  const row = db.prepare("PRAGMA database_list").all().find((item: unknown) => typeof item === "object" && item !== null && (item as { name?: string }).name === "main") as { file?: string } | undefined;
  if (!row?.file || !existsSync(row.file)) return undefined;
  const backupPath = `${row.file}.pre-${migrationId}.sqlite`;
  if (!existsSync(backupPath)) copyFileSync(row.file, backupPath);
  const checksum = createHash("sha256").update(readFileSync(backupPath)).digest("hex");
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
    db.exec("ROLLBACK"); db.prepare("UPDATE migration_runs SET status='failed',error=?,completed_at=? WHERE id=?").run(error instanceof Error ? error.message : String(error), new Date().toISOString(), runId); throw error;
  }
}

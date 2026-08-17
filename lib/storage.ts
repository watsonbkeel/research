import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { seedWorkspace } from "@/data/seed";
import { createDefaultModelSettings, publicizeModelSettings } from "./model-routing";
import { modelSettingsSchema } from "./schemas";
import { deleteLocalSecret, hasEnvironmentSecret } from "./secret-resolver";
import type {
  ChecklistStatus,
  GenerationAuditEntry,
  ModelSettings,
  PublicSettings,
  TaskType,
  WorkspaceData,
  Work,
} from "./types";
import type { SanitizedProviderAttempt } from "./provider-client";
import { getDefaultProjectId, readProjectState, registerProjectWork, writeProjectState } from "./portfolio";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");

let database: import("node:sqlite").DatabaseSync | undefined;
let openedDatabasePath = "";

function currentLocalDir() {
  return process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), ".local");
}

function currentDatabasePath() {
  return path.join(currentLocalDir(), "workbench.sqlite");
}

const cloneSeed = (): WorkspaceData => JSON.parse(JSON.stringify(seedWorkspace)) as WorkspaceData;

function getDatabase() {
  const databasePath = currentDatabasePath();
  if (database && openedDatabasePath === databasePath) return database;
  if (database) database.close();
  mkdirSync(currentLocalDir(), { recursive: true, mode: 0o700 });
  database = new DatabaseSync(databasePath);
  openedDatabasePath = databasePath;
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS generation_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      profile_id TEXT NOT NULL,
      profile_name TEXT NOT NULL,
      model TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      status TEXT NOT NULL,
      error_category TEXT,
      http_status INTEGER,
      project_id TEXT,
      document_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function readState<T>(key: string): T | undefined {
  const row = getDatabase().prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? JSON.parse(row.value) as T : undefined;
}

function writeState(key: string, value: unknown) {
  getDatabase().prepare("INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(key, JSON.stringify(value), new Date().toISOString());
}

/** Shared persistence boundary for doctoral-workbench feature stores. */
export function readWorkspaceState<T>(key: string, projectId?: string): T | undefined {
  return readProjectState<T>(projectId ?? getDefaultProjectId(), key);
}

export function writeWorkspaceState(key: string, value: unknown, projectId?: string) {
  writeProjectState(projectId ?? getDefaultProjectId(), key, value);
}

export async function readWorkspace(projectId?: string): Promise<WorkspaceData> {
  const resolvedProjectId = projectId ?? getDefaultProjectId();
  const stored = readProjectState<WorkspaceData>(resolvedProjectId, "workspace");
  if (stored && stored.schemaVersion === seedWorkspace.schemaVersion) return stored;
  if (stored) {
    const checklistStatus = new Map(stored.confirmation.map((item) => [item.id, item.status]));
    const seedIds = new Set(seedWorkspace.works.map((work) => work.id));
    const migrated: WorkspaceData = {
      ...cloneSeed(),
      project: { ...seedWorkspace.project, institution: stored.project.institution },
      confirmation: seedWorkspace.confirmation.map((item) => ({ ...item, status: checklistStatus.get(item.id) ?? item.status })),
      works: [...seedWorkspace.works, ...stored.works.filter((work) => !seedIds.has(work.id))],
      updatedAt: new Date().toISOString(),
    };
    writeProjectState(resolvedProjectId, "workspace", migrated, migrated.schemaVersion);
    return migrated;
  }
  const initial = cloneSeed();
  initial.project.id = resolvedProjectId;
  writeProjectState(resolvedProjectId, "workspace", initial, initial.schemaVersion);
  return initial;
}

export async function updateChecklist(id: string, status: ChecklistStatus, projectId?: string): Promise<WorkspaceData> {
  const resolvedProjectId = projectId ?? getDefaultProjectId();
  const workspace = await readWorkspace(resolvedProjectId);
  const item = workspace.confirmation.find((entry) => entry.id === id);
  if (!item) throw new Error("Checklist item not found");
  item.status = status;
  workspace.updatedAt = new Date().toISOString();
  writeProjectState(resolvedProjectId, "workspace", workspace, workspace.schemaVersion);
  return workspace;
}

export async function importWork(input: Pick<Work, "title" | "authors" | "year" | "venue" | "doi" | "relevance">, projectId?: string): Promise<WorkspaceData> {
  const resolvedProjectId = projectId ?? getDefaultProjectId();
  const workspace = await readWorkspace(resolvedProjectId);
  const normalizedDoi = input.doi?.trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
  const duplicate = workspace.works.find((work) =>
    (normalizedDoi && work.doi?.toLowerCase() === normalizedDoi) ||
    work.title.trim().toLowerCase() === input.title.trim().toLowerCase(),
  );
  if (duplicate) throw new Error(`文献已存在：${duplicate.title}`);
  const digest = createHash("sha256").update(normalizedDoi ?? `${input.title}|${input.year}`).digest("hex").slice(0, 12);
  const work: Work = {
    ...input,
    id: `imported-${digest}`,
    doi: normalizedDoi,
    group: "相邻研究",
    status: normalizedDoi ? "DOI已核对" : "书目信息已核对",
  };
  workspace.works.push(work);
  workspace.updatedAt = new Date().toISOString();
  writeProjectState(resolvedProjectId, "workspace", workspace, workspace.schemaVersion);
  registerProjectWork(resolvedProjectId, work);
  return workspace;
}

function migrateLegacySettings(): ModelSettings {
  const legacy = readState<{
    baseUrl?: string;
    model?: string;
    allowFullText?: boolean;
    apiKey?: string;
  }>("settings");
  const migrated = createDefaultModelSettings();
  if (legacy?.baseUrl) migrated.profiles[0].baseUrl = legacy.baseUrl;
  if (legacy?.model) migrated.profiles[0].model = legacy.model;
  migrated.allowFullText = legacy?.allowFullText ?? false;
  writeState("model_settings", migrated);

  if (legacy) {
    getDatabase().prepare("DELETE FROM app_state WHERE key = ?").run("settings");
    getDatabase().exec("PRAGMA wal_checkpoint(TRUNCATE);");
  }
  return migrated;
}

export async function readPrivateSettings(): Promise<ModelSettings> {
  const stored = readState<unknown>("model_settings");
  const parsed = modelSettingsSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  return migrateLegacySettings();
}

export function toPublicSettings(settings: ModelSettings): PublicSettings {
  return publicizeModelSettings(settings, hasEnvironmentSecret);
}

export async function saveSettings(input: ModelSettings): Promise<PublicSettings> {
  const settings = modelSettingsSchema.parse(input);
  const current = await readPrivateSettings();
  const retainedReferences = new Set(settings.profiles.map((profile) => profile.apiKeyRef));
  for (const reference of new Set(current.profiles.map((profile) => profile.apiKeyRef))) {
    if (!retainedReferences.has(reference)) deleteLocalSecret(reference);
  }
  writeState("model_settings", settings);
  return toPublicSettings(settings);
}

export async function deleteModelProfile(profileId: string): Promise<PublicSettings> {
  const settings = await readPrivateSettings();
  const profile = settings.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error("模型配置不存在。");
  const routeUsesProfile = settings.routes.some((route) =>
    route.defaultProfileId === profileId || route.fallbackProfileIds.includes(profileId),
  );
  if (routeUsesProfile) throw new Error("该模型仍被任务路由使用，请先移除路由绑定。");
  settings.profiles = settings.profiles.filter((candidate) => candidate.id !== profileId);
  return saveSettings(settings);
}

export async function recordGenerationAttempts(taskType: TaskType, attempts: SanitizedProviderAttempt[], scope: { projectId?: string; documentId?: string } = {}) {
  const statement = getDatabase().prepare(`
    INSERT INTO generation_audit (
      task_type, profile_id, profile_name, model, duration_ms, status,
      error_category, http_status, created_at, project_id, document_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = new Date().toISOString();
  for (const attempt of attempts) {
    statement.run(
      taskType,
      attempt.profileId,
      attempt.profileName,
      attempt.model,
      attempt.elapsedMs,
      attempt.status,
      attempt.errorCategory ?? null,
      attempt.httpStatus ?? null,
      createdAt,
      scope.projectId ?? null,
      scope.documentId ?? null,
    );
  }
}

export async function readGenerationAudits(limit = 50): Promise<GenerationAuditEntry[]> {
  const rows = getDatabase().prepare(`
    SELECT
      id,
      task_type AS taskType,
      profile_id AS profileId,
      profile_name AS profileName,
      model,
      duration_ms AS durationMs,
      status,
      error_category AS errorCategory,
      http_status AS httpStatus,
      created_at AS createdAt
    FROM generation_audit
    ORDER BY id DESC
    LIMIT ?
  `).all(Math.min(Math.max(limit, 1), 200));
  return rows as unknown as GenerationAuditEntry[];
}

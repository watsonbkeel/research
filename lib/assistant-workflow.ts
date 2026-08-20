import { randomUUID } from "node:crypto";
import { ensureEvidenceSchema } from "./evidence-store";
import { portfolioDatabase } from "./portfolio";
import { createResearchJob, getResearchJob, transitionJob } from "./assistant";
import type { AssistantWorkflowRun } from "./types";

const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

export function startAssistantWorkflow(input: { projectId: string; documentId: string; sectionId?: string; intent: string; idempotencyKey?: string; conversationId?: string; prompt?: string; profileId?: string }) {
  ensureEvidenceSchema();
  if (input.idempotencyKey) {
    const existing = portfolioDatabase().prepare("SELECT payload_json AS payload FROM assistant_workflow_runs WHERE project_id=? AND idempotency_key=? ORDER BY created_at DESC LIMIT 1").get(input.projectId, input.idempotencyKey) as { payload?: string } | undefined;
    if (existing?.payload) return parse<AssistantWorkflowRun>(existing.payload, undefined as never);
  }
  const timestamp = now(); const run: AssistantWorkflowRun = { id: `workflow-${randomUUID()}`, projectId: input.projectId, documentId: input.documentId, sectionId: input.sectionId, intent: input.intent, state: "planning", actions: [{ id: `workflow-action-${randomUUID()}`, tool: "get_project_snapshot", inputSummary: "读取当前项目、文档和章节", status: "pending", createdAt: timestamp }], idempotencyKey: input.idempotencyKey, conversationId: input.conversationId, prompt: input.prompt, profileId: input.profileId, createdAt: timestamp, updatedAt: timestamp };
  portfolioDatabase().prepare("INSERT INTO assistant_workflow_runs VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(run.id, run.projectId, run.documentId, run.sectionId ?? null, run.intent, run.state, JSON.stringify(run.actions), run.idempotencyKey ?? null, JSON.stringify(run), timestamp, timestamp);
  return run;
}

export function getAssistantWorkflowRun(projectId: string, runId: string) {
  ensureEvidenceSchema(); const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM assistant_workflow_runs WHERE project_id=? AND id=?").get(projectId, runId) as { payload?: string } | undefined;
  return row?.payload ? parse<AssistantWorkflowRun>(row.payload, undefined as never) : undefined;
}

export function bindAssistantWorkflowJob(projectId: string, runId: string, input: { jobId: string; conversationId?: string; prompt?: string; profileId?: string }) {
  const run = getAssistantWorkflowRun(projectId, runId); if (!run) throw new Error("WorkflowRun不存在。");
  const updated: AssistantWorkflowRun = { ...run, ...input, updatedAt: now() };
  portfolioDatabase().prepare("UPDATE assistant_workflow_runs SET payload_json=?,updated_at=? WHERE project_id=? AND id=?").run(JSON.stringify(updated), updated.updatedAt, projectId, runId);
  return updated;
}

export function bindAssistantWorkflowToJob(projectId: string, runId: string, jobId: string) {
  const run = getAssistantWorkflowRun(projectId, runId); if (!run) throw new Error("WorkflowRun不存在。");
  if (run.jobId === jobId) return run;
  return bindAssistantWorkflowJob(projectId, runId, { jobId });
}

export function advanceAssistantWorkflow(projectId: string, runId: string, state: AssistantWorkflowRun["state"], action?: Omit<AssistantWorkflowRun["actions"][number], "id" | "createdAt">) {
  const run = getAssistantWorkflowRun(projectId, runId); if (!run) throw new Error("WorkflowRun不存在。"); const timestamp = now();
  if (action) run.actions.push({ ...action, id: `workflow-action-${randomUUID()}`, createdAt: timestamp });
  run.state = state; run.updatedAt = timestamp;
  portfolioDatabase().prepare("UPDATE assistant_workflow_runs SET state=?,actions_json=?,payload_json=?,updated_at=? WHERE project_id=? AND id=?").run(run.state, JSON.stringify(run.actions), JSON.stringify(run), timestamp, projectId, runId);
  return run;
}

export function listAssistantWorkflowRuns(projectId: string, documentId?: string) {
  ensureEvidenceSchema(); const sql = documentId ? "SELECT payload_json AS payload FROM assistant_workflow_runs WHERE project_id=? AND document_id=? ORDER BY created_at DESC" : "SELECT payload_json AS payload FROM assistant_workflow_runs WHERE project_id=? ORDER BY created_at DESC";
  const rows = (documentId ? portfolioDatabase().prepare(sql).all(projectId, documentId) : portfolioDatabase().prepare(sql).all(projectId)) as Array<{ payload: string }>;
  return rows.map((row) => parse<AssistantWorkflowRun>(row.payload, undefined as never));
}

const terminalStates = new Set<AssistantWorkflowRun["state"]>(["completed", "blocked", "failed", "awaiting_full_text", "awaiting_human_verification", "awaiting_revision_approval"]);

export function recoverResumableAssistantWorkflows(projectId?: string) {
  ensureEvidenceSchema(); const rows = projectId
    ? portfolioDatabase().prepare("SELECT payload_json AS payload FROM assistant_workflow_runs WHERE project_id=? ORDER BY updated_at,id").all(projectId)
    : portfolioDatabase().prepare("SELECT payload_json AS payload FROM assistant_workflow_runs ORDER BY updated_at,id").all();
  return (rows as Array<{ payload: string }>).map((row) => parse<AssistantWorkflowRun>(row.payload, undefined as never)).filter((run) => !terminalStates.has(run.state));
}

export function recoverAndRequeueAssistantWorkflows() {
  const recovered: string[] = [];
  for (const run of recoverResumableAssistantWorkflows()) {
    const job = run.jobId ? getResearchJob(run.jobId) : undefined;
    if (job && ["queued", "running", "paused", "waiting-confirmation", "waiting-user"].includes(job.status)) continue;
    if (job && ["failed", "cancelled"].includes(job.status)) {
      transitionJob(job.id, "queued");
      recovered.push(run.id);
      continue;
    }
    if (!job || job.status === "completed") {
      const replacement = createResearchJob({
        ...(run.conversationId ? { conversationId: run.conversationId } : {}),
        prompt: run.prompt ?? `Resume assistant workflow ${run.id}`,
        kind: `assistant-${run.intent}`,
        input: {
          projectId: run.projectId,
          documentId: run.documentId,
          ...(run.sectionId ? { sectionId: run.sectionId } : {}),
          workflowRunId: run.id,
          resumedFromWorkflow: true,
          ...(run.profileId ? { profileId: run.profileId } : {}),
        },
      });
      bindAssistantWorkflowToJob(run.projectId, run.id, replacement.id);
      recovered.push(run.id);
    }
  }
  return recovered;
}

export function resumeAssistantWorkflowAfterHumanVerification(projectId: string, runId: string) {
  const run = getAssistantWorkflowRun(projectId, runId); if (!run || run.state !== "awaiting_human_verification") throw new Error("WorkflowRun 不在证据人工核验门。");
  return advanceAssistantWorkflow(projectId, runId, "matching_existing_evidence", { tool: "resume_after_human_verification", inputSummary: "researcher verified evidence", status: "completed", outputSummary: "resume the same workflow" });
}

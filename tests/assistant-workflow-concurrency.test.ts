import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal } from "@/lib/project-documents";
import { createResearchJob, listResearchJobs, transitionJob } from "@/lib/assistant";
import * as workflows from "@/lib/assistant-workflow";
import { portfolioDatabase } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic assistant workflow recovery", () => {
  async function compete(projectId: string, runId: string) {
    const barrier = path.join(directory, "recover.start");
    const children = [0, 1].map((index) => {
      const ready = path.join(directory, `recover-${index}.ready`);
      const child = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["tests/helpers/sqlite-concurrency-worker.ts", "recover", projectId, runId, ready, barrier], { cwd: process.cwd(), env: { ...process.env, WORKBENCH_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      return { ready, result: new Promise<{ action: string; jobId?: string }>((resolve, reject) => child.on("close", (code) => code === 0 ? resolve(JSON.parse(stdout.trim())) : reject(new Error(stderr || `worker exited ${code}`)))) };
    });
    await new Promise<void>((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { if (children.every((item) => existsSync(item.ready))) { clearInterval(timer); resolve(); } else if (Date.now() - started > 10_000) { clearInterval(timer); reject(new Error("recovery workers did not become ready")); } }, 5); });
    writeFileSync(barrier, "start", "utf8"); return Promise.all(children.map((item) => item.result));
  }

  it("allows two independent connections to create only one recovery job", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-workflow-concurrency-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Recovery fixture", titleZh: "恢复测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id);
    const run = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "concurrent-recovery" });
    workflows.advanceAssistantWorkflow(project.id, run.id, "auditing");
    expect(() => portfolioDatabase().prepare("SELECT 1 FROM assistant_jobs WHERE workflow_run_id=?").get(run.id)).not.toThrow();
    const results = await compete(project.id, run.id);
    expect(results.map((item) => item.action).sort()).toEqual(["created", "existing"]);
    expect(new Set(results.map((item) => item.jobId)).size).toBe(1);
    const jobs = listResearchJobs().filter((job) => job.input.workflowRunId === run.id);
    expect(jobs).toHaveLength(1);
    expect(workflows.getAssistantWorkflowRun(project.id, run.id)?.jobId).toBe(jobs[0].id);
  }, 20_000);

  it("requeues a failed bound job only once under competition", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-workflow-failed-concurrency-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Failed recovery fixture", titleZh: "失败恢复测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" }); const document = ensureProjectProposal(project.id);
    const run = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision" }); workflows.advanceAssistantWorkflow(project.id, run.id, "auditing");
    const job = createResearchJob({ prompt: "failed", kind: "assistant-section_revision", input: { projectId: project.id, documentId: document.id, workflowRunId: run.id } }); workflows.bindAssistantWorkflowToJob(project.id, run.id, job.id);
    transitionJob(job.id, "cancelled");
    const results = await compete(project.id, run.id);
    expect(results.map((item) => item.action).sort()).toEqual(["existing", "requeued"]);
    expect(listResearchJobs().filter((item) => item.input.workflowRunId === run.id && item.status === "queued")).toHaveLength(1);
  }, 20_000);

  it("does not recover a human verification gate", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-workflow-human-gate-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Human gate fixture", titleZh: "人工门测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id);
    const run = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision" });
    workflows.advanceAssistantWorkflow(project.id, run.id, "awaiting_human_verification");
    const results = await compete(project.id, run.id);
    expect(results.every((item) => item.action === "not-resumable")).toBe(true);
    expect(listResearchJobs()).toHaveLength(0);
  }, 20_000);
});

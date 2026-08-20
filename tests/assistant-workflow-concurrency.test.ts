import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal } from "@/lib/project-documents";
import { listResearchJobs } from "@/lib/assistant";
import * as workflows from "@/lib/assistant-workflow";
import { portfolioDatabase } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic assistant workflow recovery", () => {
  it("enforces one active job per resumable workflow", () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-workflow-concurrency-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Recovery fixture", titleZh: "恢复测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id);
    const run = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "concurrent-recovery" });
    workflows.advanceAssistantWorkflow(project.id, run.id, "auditing");
    expect(() => portfolioDatabase().prepare("SELECT 1 FROM assistant_jobs WHERE workflow_run_id=?").get(run.id)).not.toThrow();
    const recovered = workflows.recoverAndRequeueAssistantWorkflows();
    expect(recovered).toContain(run.id);
    workflows.recoverAndRequeueAssistantWorkflows();
    const jobs = listResearchJobs().filter((job) => job.input.workflowRunId === run.id);
    expect(jobs).toHaveLength(1);
  });

  it("does not recover a human verification gate", () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-workflow-human-gate-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Human gate fixture", titleZh: "人工门测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id);
    const run = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision" });
    workflows.advanceAssistantWorkflow(project.id, run.id, "awaiting_human_verification");
    expect(workflows.recoverAndRequeueAssistantWorkflows()).not.toContain(run.id);
    expect(listResearchJobs()).toHaveLength(0);
  });
});

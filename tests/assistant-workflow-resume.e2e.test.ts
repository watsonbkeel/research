import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as workflows from "@/lib/assistant-workflow";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal } from "@/lib/project-documents";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("AssistantWorkflowRun resume regressions", () => {
  it("discovers only resumable non-terminal runs without crossing human gates", () => {
    directory = mkdtempSync(path.join(tmpdir(), "workflow-resume-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Workflow fixture", titleZh: "工作流测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" }); const document = ensureProjectProposal(project.id);
    const waiting = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "waiting" }); workflows.advanceAssistantWorkflow(project.id, waiting.id, "awaiting_human_verification");
    const active = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "active" }); workflows.advanceAssistantWorkflow(project.id, active.id, "auditing");
    const recover = (workflows as unknown as { recoverResumableAssistantWorkflows?: (projectId: string) => Array<{ id: string }> }).recoverResumableAssistantWorkflows;
    expect(recover).toBeTypeOf("function");
    expect(recover!(project.id).map((item) => item.id)).toEqual([active.id]);
    expect(workflows.getAssistantWorkflowRun(project.id, waiting.id)?.state).toBe("awaiting_human_verification");
  });
});

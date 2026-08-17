import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { addMessage, claimNextJob, createConversation, createResearchJob, getResearchJob, heartbeatJob, listJobEvents, listMessages, recoverExpiredJobs, transitionJob } from "@/lib/assistant";

const dirs: string[] = [];
afterEach(() => { const dir = dirs.pop(); if (dir) rmSync(dir, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });
function isolated() { const dir = mkdtempSync(path.join("/tmp", "assistant-test-")); dirs.push(dir); process.env.WORKBENCH_DATA_DIR = dir; }

describe("persistent research assistant", () => {
  it("persists conversations and validates message ownership", () => {
    isolated(); const conversation = createConversation({ title: "Methods" });
    addMessage(conversation.id, { role: "user", content: "Find evidence" });
    expect(listMessages(conversation.id)[0].content).toBe("Find evidence");
    expect(() => addMessage("missing", { role: "user", content: "x" })).toThrow("Conversation not found");
  });
  it("enforces job transitions and records events", () => {
    isolated(); const job = createResearchJob({ prompt: "Review literature" });
    expect(() => transitionJob(job.id, "completed")).toThrow("Invalid job transition");
    const claimed = claimNextJob("worker-a", 1000)!; expect(claimed.status).toBe("running");
    expect(heartbeatJob(job.id, "worker-a").leaseOwner).toBe("worker-a");
    expect(() => heartbeatJob(job.id, "worker-b")).toThrow("Job lease not held");
    transitionJob(job.id, "completed"); expect(getResearchJob(job.id)?.status).toBe("completed");
    expect(listJobEvents(job.id).map((event) => event.type)).toEqual(["queued", "running", "completed"]);
  });
  it("recovers an expired running lease", () => {
    isolated(); const job = createResearchJob({ prompt: "Recover" }); claimNextJob("dead-worker", -1);
    expect(recoverExpiredJobs()).toBe(1); expect(getResearchJob(job.id)?.status).toBe("queued");
  });
});

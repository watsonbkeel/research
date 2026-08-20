import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { claimNextJob, createResearchJob, listJobEvents, getResearchJob } from "@/lib/assistant";
import { portfolioDatabase } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic assistant job claiming", () => {
  it("installs an active-job schema and never emits a second running event", () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-job-concurrency-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const job = createResearchJob({ prompt: "compete", kind: "fixture" });
    const indexes = portfolioDatabase().prepare("PRAGMA index_list(assistant_jobs)").all() as Array<{ name: string }>;
    expect(indexes.map((item) => item.name)).toContain("idx_assistant_jobs_one_active_per_workflow");

    const [left, right] = [claimNextJob("worker-a"), claimNextJob("worker-b")];
    expect([left, right].filter(Boolean)).toHaveLength(1);
    expect(listJobEvents(job.id).filter((event) => event.type === "running")).toHaveLength(1);
    expect(getResearchJob(job.id)?.leaseOwner).toBe((left ?? right)?.leaseOwner);
  });
});

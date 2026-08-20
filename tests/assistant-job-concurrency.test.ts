import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createResearchJob, listJobEvents, getResearchJob } from "@/lib/assistant";
import { portfolioDatabase } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic assistant job claiming", () => {
  async function compete(owners: string[]) {
    const barrier = path.join(directory, "claim.start");
    const children = owners.map((owner, index) => {
      const ready = path.join(directory, `claim-${index}.ready`);
      const child = spawn(path.join(process.cwd(), "node_modules/.bin/tsx"), ["tests/helpers/sqlite-concurrency-worker.ts", "claim", owner, "unused", ready, barrier], { cwd: process.cwd(), env: { ...process.env, WORKBENCH_DATA_DIR: directory }, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = ""; let stderr = ""; child.stdout.on("data", (chunk) => { stdout += String(chunk); }); child.stderr.on("data", (chunk) => { stderr += String(chunk); });
      return { child, ready, result: new Promise<{ jobId?: string; owner?: string }>((resolve, reject) => child.on("close", (code) => code === 0 ? resolve(JSON.parse(stdout.trim())) : reject(new Error(stderr || `worker exited ${code}`)))) };
    });
    await new Promise<void>((resolve, reject) => { const started = Date.now(); const timer = setInterval(() => { if (children.every((item) => existsSync(item.ready))) { clearInterval(timer); resolve(); } else if (Date.now() - started > 10_000) { clearInterval(timer); reject(new Error("concurrency workers did not become ready")); } }, 5); });
    writeFileSync(barrier, "start", "utf8");
    return Promise.all(children.map((item) => item.result));
  }

  it("allows only one of two independent SQLite connections to claim one job", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-job-concurrency-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const job = createResearchJob({ prompt: "compete", kind: "fixture" });
    const indexes = portfolioDatabase().prepare("PRAGMA index_list(assistant_jobs)").all() as Array<{ name: string }>;
    expect(indexes.map((item) => item.name)).toContain("idx_assistant_jobs_one_active_per_workflow");

    const results = await compete(["worker-a", "worker-b"]);
    expect(results.filter((item) => item.jobId)).toHaveLength(1);
    expect(listJobEvents(job.id).filter((event) => event.type === "running")).toHaveLength(1);
    expect(results.map((item) => item.owner)).toContain(getResearchJob(job.id)?.leaseOwner);
  }, 20_000);

  it("gives two competing workers different jobs", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "assistant-two-job-concurrency-")); process.env.WORKBENCH_DATA_DIR = directory;
    createResearchJob({ prompt: "first", kind: "fixture" }); createResearchJob({ prompt: "second", kind: "fixture" });
    const results = await compete(["worker-a", "worker-b"]);
    expect(new Set(results.map((item) => item.jobId)).size).toBe(2);
    expect(results.every((item) => item.jobId)).toBe(true);
  }, 20_000);
});

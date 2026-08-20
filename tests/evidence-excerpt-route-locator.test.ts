import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST, PATCH } from "@/app/api/projects/[projectId]/evidence-excerpts/route";
import { createProject, registerProjectWork } from "@/lib/portfolio";
import { writeProjectState } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("project evidence excerpt route locator handling", () => {
  it("accepts typed non-page locators, rejects untyped locators, and patches legacy records", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "evidence-route-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Evidence route", titleZh: "证据路由", field: "Field", context: "Context", institution: "A", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const work = { id: "work-route", authors: "Researcher", year: 2026, title: "Route work", venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "verified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" };
    registerProjectWork(project.id, work);
    updateWorkVerification(project.id, work.id, { id: "verification-route", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { title: true }, result: "verified", retractionStatus: "clear" });
    const workspace = await readWorkspace(project.id); workspace.works = [work]; writeProjectState(project.id, "workspace", workspace);
    const typed = await POST(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "POST", body: JSON.stringify({ workId: work.id, locatorType: "chapter", locator: "Chapter 3", paraphrase: "A note" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: project.id }) });
    expect(typed.status).toBe(201);
    expect((await typed.json()).excerpt).toMatchObject({ locatorType: "chapter", locator: "Chapter 3" });
    const untyped = await POST(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "POST", body: JSON.stringify({ workId: work.id, locator: "Methods", paraphrase: "A note" }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: project.id }) });
    expect(untyped.status).toBe(400);
    expect((await untyped.json()).error).toMatch(/locatorType/);
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { createEvidenceExcerpt, listEvidenceExcerpts, updateEvidenceExcerpt } from "@/lib/evidence-excerpts";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

async function fixture() {
  directory = mkdtempSync(path.join(tmpdir(), "evidence-locator-switch-"));
  process.env.WORKBENCH_DATA_DIR = directory;
  const project = createProject({ titleEn: "Locator switch", titleZh: "定位切换", field: "Methods", context: "Fixture", institution: "University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
  const work = { id: "work-locator", authors: "Author", year: 2026, title: "Locator work", venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "unverified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" };
  registerProjectWork(project.id, work);
  const workspace = await readWorkspace(project.id); workspace.works = [work]; writeProjectState(project.id, "workspace", workspace);
  updateWorkVerification(project.id, work.id, { id: "verification-locator", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
  const excerpt = await createEvidenceExcerpt({ workId: work.id, locatorType: "page", page: "12", paraphrase: "A bounded note", verificationStatus: "unverified" }, project.id);
  return { project, excerpt };
}

describe("EvidenceExcerpt locator switching", () => {
  it("clears page when switching page to chapter", async () => {
    const { project, excerpt } = await fixture();
    const updated = await updateEvidenceExcerpt({ id: excerpt.id, locatorType: "chapter", locator: "Chapter 3" }, project.id);
    const persisted = (await listEvidenceExcerpts({ projectId: project.id, id: excerpt.id }))[0];
    expect(updated).toMatchObject({ locatorType: "chapter", locator: "Chapter 3", page: undefined });
    expect(persisted).toMatchObject({ locatorType: "chapter", locator: "Chapter 3", page: undefined });
  });

  it("clears locator when switching non-page to page", async () => {
    const { project, excerpt } = await fixture();
    const chapter = await updateEvidenceExcerpt({ id: excerpt.id, locatorType: "chapter", locator: "Chapter 3" }, project.id);
    const updated = await updateEvidenceExcerpt({ id: chapter.id, locatorType: "page", page: "15" }, project.id);
    const persisted = (await listEvidenceExcerpts({ projectId: project.id, id: excerpt.id }))[0];
    expect(updated).toMatchObject({ locatorType: "page", page: "15", locator: undefined });
    expect(persisted).toMatchObject({ locatorType: "page", page: "15", locator: undefined });
  });
});

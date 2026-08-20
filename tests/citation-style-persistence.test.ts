import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject, closePortfolioDatabase, getProject, updateProject } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument, listDocumentVersions, saveProjectDocument } from "@/lib/project-documents";
import { PATCH } from "@/app/api/projects/[projectId]/route";

let directory = "";
afterEach(() => { closePortfolioDatabase(); if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

function fixture() {
  directory = mkdtempSync(path.join(tmpdir(), "citation-style-persistence-")); process.env.WORKBENCH_DATA_DIR = directory;
  return createProject({ titleEn: "Citation style fixture", titleZh: "引用格式测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
}

describe("citation style persistence", () => {
  it("persists GB/T across SQLite reopen while preserving old version APA", () => {
    const project = fixture(); expect(project.citationStyle).toBe("APA 7");
    const document = ensureProjectProposal(project.id); const oldVersionId = document.currentVersionId!;
    updateProject(project.id, { citationStyle: "GB/T 7714" }); expect(getProject(project.id)?.citationStyle).toBe("GB/T 7714");
    const current = getProjectDocument(project.id, document.id)!; saveProjectDocument(project.id, document.id, current.manuscript, { expectedVersion: current.currentVersionNumber, editor: "researcher" });
    closePortfolioDatabase();
    expect(getProject(project.id)?.citationStyle).toBe("GB/T 7714");
    const versions = listDocumentVersions(project.id, document.id); expect(versions.find((version) => version.id === oldVersionId)?.citationStyle).toBe("APA 7"); expect(versions[0].citationStyle).toBe("GB/T 7714");
  });

  it("rejects unsupported citation styles at the project API boundary", async () => {
    const project = fixture();
    const invalid = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ citationStyle: "Harvard" }) }), { params: Promise.resolve({ projectId: project.id }) });
    expect(invalid.status).toBe(400);
    const valid = await PATCH(new Request("http://localhost", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ citationStyle: "GB/T 7714" }) }), { params: Promise.resolve({ projectId: project.id }) });
    expect(valid.status).toBe(200); expect((await valid.json()).citationStyleChanged).toBe(true);
  });
});

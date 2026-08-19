import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as projectDocuments from "@/lib/project-documents";
import { createProject } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("versioned proposal export regressions", () => {
  it("reconstructs all formal export inputs from the selected immutable version", () => {
    directory = mkdtempSync(path.join(tmpdir(), "version-export-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Export fixture", titleZh: "导出测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = projectDocuments.ensureProjectProposal(project.id);
    const load = (projectDocuments as unknown as { formalExportSnapshot?: (projectId: string, documentId: string, versionId: string) => unknown }).formalExportSnapshot;
    expect(load).toBeTypeOf("function");
    expect(load!(project.id, document.id, document.currentVersionId!)).toEqual(expect.objectContaining({ workspace: expect.any(Object), researchPlan: expect.any(Object), institution: expect.any(Object), citationStyle: expect.any(String) }));
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createProject, getProject } from "@/lib/portfolio";
import { ensureProjectProposal, listDocumentVersions } from "@/lib/project-documents";
import { updateProjectCitationStyleAtomically } from "@/lib/portfolio";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic citation style updates", () => {
  it("updates the project and all document versions as one operation", () => {
    directory = mkdtempSync(path.join(tmpdir(), "citation-style-transaction-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Atomic style fixture", titleZh: "格式事务测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const first = ensureProjectProposal(project.id);
    const second = ensureProjectProposal(project.id);
    const before = [first, second].map((document) => ({ id: document.id, count: listDocumentVersions(project.id, document.id).length }));
    const result = updateProjectCitationStyleAtomically({ projectId: project.id, citationStyle: "GB/T 7714", editor: "researcher" });
    expect(result.project.citationStyle).toBe("GB/T 7714");
    expect(getProject(project.id)?.citationStyle).toBe("GB/T 7714");
    for (const document of before) {
      const versions = listDocumentVersions(project.id, document.id);
      expect(versions).toHaveLength(document.count + 1);
      expect(versions[0].citationStyle).toBe("GB/T 7714");
      expect(versions[0].approvalStatus).toBe("not_reviewed");
    }
    expect(updateProjectCitationStyleAtomically({ projectId: project.id, citationStyle: "GB/T 7714", editor: "researcher" }).documentVersions).toHaveLength(0);
  });
});

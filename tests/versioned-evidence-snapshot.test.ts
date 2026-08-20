import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal, getDocumentVersion } from "@/lib/project-documents";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("immutable formal evidence snapshot regressions", () => {
  it("freezes citation, evidence and proposal inputs with independent hashes", () => {
    directory = mkdtempSync(path.join(tmpdir(), "version-evidence-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Snapshot fixture", titleZh: "快照测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id); const version = getDocumentVersion(project.id, document.id, document.currentVersionId!)!;
    expect(version).toEqual(expect.objectContaining({ citationStyle: expect.any(String), claims: expect.any(Array), citationItems: expect.any(Array), citationClusters: expect.any(Array), evidenceReferences: expect.any(Array), researchPlanSnapshot: expect.anything(), institutionProfileSnapshot: expect.anything(), evidenceBindingHash: expect.stringMatching(/^[a-f0-9]{64}$/), proposalInputHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
    expect((version.citationClusters ?? []).every((cluster) => Number.isInteger(cluster.documentOrder) && (cluster.documentOrder ?? 0) > 0)).toBe(true);
  });
});

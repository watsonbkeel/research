import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal, saveProjectDocument } from "@/lib/project-documents";
import { compileClaimCoverage, deterministicClaimCoverageClassifier } from "@/lib/claim-coverage";
import { readWorkspace, writeWorkspaceState } from "@/lib/storage";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("Chinese formal Claim Coverage regressions", () => {
  it("splits adjacent Chinese sentences and does not infer a Claim from quantity", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "chinese-coverage-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Synthetic Chinese coverage", titleZh: "虚构中文覆盖", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id); const workspace = await readWorkspace(project.id);
    workspace.claims = [{ id: "claim-only", text: "unrelated registered wording", kind: "已发表事实", citationIds: [] }]; writeWorkspaceState("workspace", workspace, project.id);
    const section = document.manuscript.chapters[2].sections[0]; section.title = "Theory";
    section.content = "已有研究表明，信息透明度会影响用户信任。另一项研究发现，这种影响受到任务风险调节。本文将透明度定义为信息可见程度；本文据此提出两个待检验假设。";
    section.claimIds = ["claim-only"]; saveProjectDocument(project.id, document.id, document.manuscript);
    const report = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier: deterministicClaimCoverageClassifier });
    const sentences = report.paragraphs.flatMap((item) => item.sentences);
    expect(sentences).toHaveLength(4);
    expect(sentences.slice(0, 2).map((item) => item.classification)).toEqual(["published_fact", "published_fact"]);
    expect(sentences[0].claimIds).toEqual([]);
    expect(sentences[0].coverageStatus).toBe("unsupported");
    expect(report.status).toBe("blocked");
  });
});

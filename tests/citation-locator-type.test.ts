import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { documentVersionContentHash, documentVersionEvidenceBindingHash, documentVersionProposalInputHash, ensureProjectProposal, getDocumentVersion, hydrateCitationItemsFromBindings } from "@/lib/project-documents";
import type { DocumentVersion } from "@/lib/types";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { createEvidenceExcerpt, listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { readWorkspace, writeWorkspaceState } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { portfolioDatabase } from "@/lib/portfolio";
import { checkFormalExportGate } from "@/lib/formal-export-gate";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("evidence locator type preservation", () => {
  it.each([
    ["page", "3", "page"],
    ["chapter", "3", "chapter"],
    ["section", "Method", "section"],
    ["paragraph", "5", "paragraph"],
    ["figure", "Figure 2", "figure"],
    ["table", "Table 4", "table"],
  ])("preserves %s locator semantics", (locatorType, locator, expected) => {
    const version = {
      citationItems: [{ id: "citation-1", workId: "work-1" }],
      citationClusters: [{ id: "cluster-1", sectionId: "section-1", sentenceId: "sentence-1", documentOrder: 1, position: 0, mode: "parenthetical", items: [{ id: "citation-1", workId: "work-1" }] }],
      claimEvidenceCitationBindings: [{ id: "binding-1", projectId: "project-1", documentId: "document-1", documentVersionId: "version-1", sectionId: "section-1", sentenceId: "sentence-1", claimId: "claim-1", evidenceExcerptId: "excerpt-1", workId: "work-1", citationItemId: "citation-1", relation: "supports", createdAt: "2026-08-20T00:00:00.000Z" }],
      evidenceExcerptsSnapshot: [{ id: "excerpt-1", workId: "work-1", locatorType, locator, verificationStatus: "human_verified" }],
    } as unknown as DocumentVersion;
    const hydrated = hydrateCitationItemsFromBindings(version);
    expect(hydrated.citationItems?.[0]).toMatchObject({ locatorType: expected, locator });
  });

  it("does not guess a missing locator type", () => {
    const version = {
      citationItems: [{ id: "citation-1", workId: "work-1" }],
      citationClusters: [],
      claimEvidenceCitationBindings: [{ id: "binding-1", projectId: "project-1", documentId: "document-1", documentVersionId: "version-1", sectionId: "section-1", sentenceId: "sentence-1", claimId: "claim-1", evidenceExcerptId: "excerpt-1", workId: "work-1", citationItemId: "citation-1", relation: "supports", createdAt: "2026-08-20T00:00:00.000Z" }],
      evidenceExcerptsSnapshot: [{ id: "excerpt-1", workId: "work-1", locator: "Method", verificationStatus: "human_verified" }],
    } as unknown as DocumentVersion;
    expect(hydrateCitationItemsFromBindings(version).citationItems?.[0]).not.toHaveProperty("locatorType");
  });

  it("migrates legacy page data to page but keeps an untyped legacy locator unknown", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "legacy-locators-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Legacy locator fixture", titleZh: "旧定位测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const common = { projectId: project.id, workId: "legacy-work", paraphrase: "Legacy", supportDirection: "supporting", strength: "medium", relevance: "medium", verificationStatus: "unverified", rightsStatus: "unknown", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" };
    writeProjectState(project.id, "evidence_excerpts", [{ ...common, id: "legacy-page", page: "4" }, { ...common, id: "legacy-untyped", locator: "Method" }]);
    const excerpts = await listEvidenceExcerpts({ projectId: project.id });
    expect(excerpts.find((item) => item.id === "legacy-page")?.locatorType).toBe("page");
    expect(excerpts.find((item) => item.id === "legacy-untyped")?.locatorType).toBeUndefined();
  });

  it("rejects new locator data without an explicit type", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "new-locator-validation-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "New locator fixture", titleZh: "新定位测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const work = { id: "work-locator", authors: "Researcher", year: 2026, title: "Locator fixture", venue: "Fixture", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "verified" as const, relevance: "fixture" };
    registerProjectWork(project.id, work); const workspace = await readWorkspace(project.id); workspace.works = [work]; writeWorkspaceState("workspace", workspace, project.id);
    updateWorkVerification(project.id, work.id, { id: "verification-locator", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
    await expect(createEvidenceExcerpt({ workId: "work-locator", paraphrase: "New", locator: "Method" }, project.id)).rejects.toThrow(/locatorType/);
  });

  it("blocks an untyped legacy locator in the formal gate", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "formal-untyped-locator-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Formal locator fixture", titleZh: "正式定位测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" }); const document = ensureProjectProposal(project.id);
    const version = getDocumentVersion(project.id, document.id, document.currentVersionId!)!; const section = version.sections[0]; section.content = "Fact [[CITE:work-locator]].";
    version.citationItems = [{ id: "citation-untyped", workId: "work-locator" }]; version.citationClusters = [{ id: "cluster-untyped", sectionId: section.sectionId, sentenceId: "sentence-untyped", documentOrder: 1, position: 5, mode: "parenthetical", items: version.citationItems }];
    version.claimEvidenceCitationBindings = [{ id: "binding-untyped", projectId: project.id, documentId: document.id, documentVersionId: version.id, sectionId: section.sectionId, sentenceId: "sentence-untyped", claimId: "claim-untyped", evidenceExcerptId: "excerpt-untyped", workId: "work-locator", citationItemId: "citation-untyped", relation: "supports", createdAt: "2026-08-20T00:00:00.000Z" }];
    version.evidenceExcerptsSnapshot = [{ id: "excerpt-untyped", workId: "work-locator", locator: "Method", verificationStatus: "human_verified" }]; version.evidenceReferences = [{ evidenceExcerptId: "excerpt-untyped", evidenceExcerptHash: "fixture", workId: "work-locator", verificationStatus: "human_verified", locator: "Method" }];
    version.contentHash = documentVersionContentHash(version); version.evidenceBindingHash = documentVersionEvidenceBindingHash(version); version.proposalInputHash = documentVersionProposalInputHash(version);
    portfolioDatabase().prepare("UPDATE document_snapshots SET payload_json=? WHERE id=?").run(JSON.stringify(version), version.id);
    const gate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: version.id });
    expect(gate.blockers.map((item) => item.code)).toContain("citation-locator-type-missing");
  });
});

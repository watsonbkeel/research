import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createProject, getProject, portfolioDatabase } from "@/lib/portfolio";
import { createJournalArticle, ensureProjectProposal, listDocumentVersions, updateProjectCitationStyleAtomically } from "@/lib/project-documents";
import { documentApprovalForVersion, saveDocumentApproval } from "@/lib/evidence-store";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

describe("atomic citation style updates", () => {
  it("updates the project and all document versions as one operation", () => {
    directory = mkdtempSync(path.join(tmpdir(), "citation-style-transaction-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Atomic style fixture", titleZh: "格式事务测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const first = ensureProjectProposal(project.id);
    const second = createJournalArticle(project.id, { title: "Second document" });
    const third = createJournalArticle(project.id, { title: "Third document" });
    const before = [first, second, third].map((document) => ({ id: document.id, count: listDocumentVersions(project.id, document.id).length }));
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

  it("rolls back project, all snapshots, current pointers and approvals after a forced mid-transaction failure", () => {
    directory = mkdtempSync(path.join(tmpdir(), "citation-style-rollback-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Rollback style fixture", titleZh: "格式回滚测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const documents = [ensureProjectProposal(project.id), createJournalArticle(project.id, { title: "Document B" }), createJournalArticle(project.id, { title: "Document C" })];
    const before = documents.map((document) => ({ id: document.id, currentVersionId: document.currentVersionId!, versionCount: listDocumentVersions(project.id, document.id).length }));
    saveDocumentApproval({ projectId: project.id, documentId: documents[0].id, documentVersionId: documents[0].currentVersionId!, decision: "approved", reviewer: "Researcher" });
    const escapedId = documents[1].id.replaceAll("'", "''");
    portfolioDatabase().exec(`CREATE TRIGGER force_snapshot_failure BEFORE INSERT ON document_snapshots WHEN NEW.document_id='${escapedId}' BEGIN SELECT RAISE(ABORT, 'forced snapshot failure'); END`);
    expect(() => updateProjectCitationStyleAtomically({ projectId: project.id, citationStyle: "GB/T 7714", editor: "researcher" })).toThrow(/forced snapshot failure/);
    expect(getProject(project.id)?.citationStyle).toBe("APA 7");
    for (const item of before) {
      const row = portfolioDatabase().prepare("SELECT current_version_id AS currentVersionId FROM documents WHERE id=?").get(item.id) as { currentVersionId: string };
      expect(row.currentVersionId).toBe(item.currentVersionId); expect(listDocumentVersions(project.id, item.id)).toHaveLength(item.versionCount);
    }
    expect(documentApprovalForVersion(project.id, documents[0].id, documents[0].currentVersionId!)).toBeDefined();
    portfolioDatabase().exec("DROP TRIGGER force_snapshot_failure");
    const success = updateProjectCitationStyleAtomically({ projectId: project.id, citationStyle: "GB/T 7714", editor: "researcher" });
    expect(success.documentVersions).toHaveLength(3);
    for (const item of before) { const versions = listDocumentVersions(project.id, item.id); expect(versions).toHaveLength(item.versionCount + 1); expect(versions[0]).toMatchObject({ citationStyle: "GB/T 7714", approvalStatus: "not_reviewed" }); }
    expect(updateProjectCitationStyleAtomically({ projectId: project.id, citationStyle: "GB/T 7714", editor: "researcher" }).documentVersions).toHaveLength(0);
  });
});

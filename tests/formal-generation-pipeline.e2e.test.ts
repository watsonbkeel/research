import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProject } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument, listDocumentVersions } from "@/lib/project-documents";
import { promoteStructuredDraft } from "@/lib/generation-service";
import { listQuarantinedDrafts } from "@/lib/evidence-store";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("formal generation pipeline regressions", () => {
  it("quarantines a blocked provisional draft without changing content or currentVersionId", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "formal-generation-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Blocked generation", titleZh: "阻断生成", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" }); const document = ensureProjectProposal(project.id); const section = document.manuscript.chapters[2].sections[0]; const beforeVersion = document.currentVersionId; const beforeContent = section.content; const beforeCount = listDocumentVersions(project.id, document.id).length;
    const result = await promoteStructuredDraft({ projectId: project.id, documentId: document.id, sectionId: section.id, idempotencyKey: "blocked-provisional", draft: { projectId: project.id, documentId: document.id, sectionId: section.id, paragraphs: [{ markdown: "已有研究表明，这是一条没有证据和引用的事实。", claims: [{ claimId: "missing-claim", claimText: "已有研究表明，这是一条没有证据和引用的事实", kind: "published_fact", evidenceExcerptIds: [], citationWorkIds: [] }] }], unsupportedStatements: [], assumptions: [], evidenceGaps: [] } });
    expect(result.status).toBe("quarantined"); expect(result.audit.blockers.length).toBeGreaterThan(0); expect(getProjectDocument(project.id, document.id)?.currentVersionId).toBe(beforeVersion); expect(getProjectDocument(project.id, document.id)?.manuscript.chapters[2].sections[0].content).toBe(beforeContent); expect(listDocumentVersions(project.id, document.id)).toHaveLength(beforeCount); expect(listQuarantinedDrafts(project.id, document.id)).toHaveLength(1);
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, portfolioDatabaseForTests, registerProjectWork } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument, listDocumentVersions, restoreProjectDocumentVersion, saveProjectDocument, setProjectDocumentEvidenceMode } from "@/lib/project-documents";
import { compileClaimCoverage, deterministicClaimCoverageClassifier, parseParagraph, type ClaimCoverageClassifier } from "@/lib/claim-coverage";
import { createEvidenceExcerpt } from "@/lib/evidence-excerpts";
import { createClaimEvidenceCitationBinding } from "@/lib/claim-evidence-binding";
import { runCitationAudit } from "@/lib/citation-audit";
import { advanceAssistantWorkflow, getAssistantWorkflowRun, startAssistantWorkflow } from "@/lib/assistant-workflow";
import { migrationSnapshot, runMigration } from "@/lib/migration-service";
import { readWorkspace, writeWorkspaceState } from "@/lib/storage";
import { documentApprovalForVersion, ensureEvidenceSchema, saveDocumentApproval, updateWorkVerification } from "@/lib/evidence-store";
import { referencesFor, renderCitationCluster, renderCitationTokens } from "@/lib/citation-service";
import type { Claim, Work } from "@/lib/types";

const directories: string[] = [];
afterEach(() => { const directory = directories.pop(); if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "p0-final-")); directories.push(directory); process.env.WORKBENCH_DATA_DIR = directory;
  const project = createProject({ titleEn: "Synthetic evidence integrity study", titleZh: "虚构证据完整性研究", field: "Research integrity", context: "Synthetic fixture", institution: "Verified Test University", primaryOutcome: "Integrity", secondaryOutcome: "Traceability" });
  return { project, document: ensureProjectProposal(project.id) };
}

async function evidenceFixture() {
  const { project, document } = fixture(); const workspace = await readWorkspace(project.id);
  ensureEvidenceSchema(); const work: Work = { id: "work-a", authors: "Li, Ming", year: 2024, title: "Synthetic verified evidence", venue: "Fixture Journal", sourceType: "journal-article", group: "理论来源", status: "未核验", bibliographicStatus: "unverified", relevance: "fixture", retractionStatus: "unknown" }; registerProjectWork(project.id, work); updateWorkVerification(project.id, work.id, { id: "verification-a", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-19T00:00:00.000Z", matchedFields: { doi: true, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" }); const verifiedWork = { ...work, status: "书目信息已核对" as const, bibliographicStatus: "verified" as const, retractionStatus: "clear" as const };
  const claims: Claim[] = [{ id: "claim-a", text: "已有研究证明，感知透明度显著影响信任", kind: "已发表事实", citationIds: [work.id] }, { id: "claim-b", text: "本文推断该关系具有情境边界", kind: "研究者推论", citationIds: [] }];
  workspace.works = [verifiedWork]; workspace.claims = claims; writeWorkspaceState("workspace", workspace, project.id);
  const excerpt = await createEvidenceExcerpt({ id: "excerpt-a", workId: verifiedWork.id, paraphrase: "Synthetic supporting evidence.", locatorType: "page", locator: "12", claimId: "claim-a", supportDirection: "supporting", verificationStatus: "human_verified", reviewer: "Researcher", reviewedAt: "2026-08-19T00:00:00.000Z" }, project.id);
  const section = document.manuscript.chapters[2].sections[0]; section.content = "已有研究证明，感知透明度显著影响信任 [[CITE:work-a]]。"; section.claimIds = claims.map((item) => item.id); section.citationIds = [work.id]; section.evidenceExcerptIds = [excerpt.id];
  const saved = saveProjectDocument(project.id, document.id, document.manuscript); const versionId = saved.currentVersionId!;
  const coverage = await compileClaimCoverage({ projectId: project.id, documentId: document.id, versionId, classifier: deterministicClaimCoverageClassifier }); const sentence = coverage.paragraphs.find((item) => item.sectionId === section.id)!.sentences[0];
  return { project, document: saved, section, work: verifiedWork, claims, excerpt, versionId, coverage, sentence };
}

describe("P0 final closure", () => {
  it("keeps citation offsets before sentence classification", () => {
    const parsed = parseParagraph("Fact [[CITE:work-a;work-b]].", "p1", 10);
    expect(parsed.rawText).toContain("[[CITE:"); expect(parsed.plainText).toHaveLength(parsed.rawText.length); expect(parsed.citations.map((item) => item.workId)).toEqual(["work-a", "work-b"]); expect(parsed.citations[0].startOffset).toBeGreaterThanOrEqual(10);
  });

  it("classifies published facts by sentence semantics even in a theory section", async () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[2].sections[0]; section.title = "Theory and Definitions"; section.content = "已有研究证明，感知透明度显著影响消费者信任。"; saveProjectDocument(project.id, document.id, document.manuscript);
    const report = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier: deterministicClaimCoverageClassifier }); expect(report.paragraphs[0].sentences[0].classification).toBe("published_fact"); expect(report.status).toBe("blocked");
  });

  it("turns classifier failures and invalid output into formal unknown blockers", async () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[0].sections[0]; section.content = "A sentence requiring classification."; saveProjectDocument(project.id, document.id, document.manuscript);
    const classifier: ClaimCoverageClassifier = { classify: async () => { throw new Error("offline"); } }; const report = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier });
    expect(report.totals?.unknownCount).toBe(1); expect(report.blockers.some((item) => item.code === "unknown-sentence")).toBe(true);
  });

  it("accepts multiple structured claim spans without string containment", async () => {
    const { project, document } = fixture(); const workspace = await readWorkspace(project.id); workspace.claims = [{ id: "c1", text: "unrelated canonical wording one", kind: "研究者推论", citationIds: [] }, { id: "c2", text: "unrelated canonical wording two", kind: "研究者推论", citationIds: [] }]; writeWorkspaceState("workspace", workspace, project.id);
    const section = document.manuscript.chapters[0].sections[0]; section.content = "A paraphrase combines two distinct inferences."; section.claimIds = ["c1", "c2"]; saveProjectDocument(project.id, document.id, document.manuscript);
    const classifier: ClaimCoverageClassifier = { classify: async (input) => input.sentences.map((sentence) => ({ sentenceId: sentence.sentenceId, classification: "researcher_inference", claimSpans: [{ text: "first", startOffset: 0, endOffset: 5, suggestedClaimId: "c1" }, { text: "second", startOffset: 6, endOffset: 12, suggestedClaimId: "c2" }], confidence: 0.9, rationaleCode: "fixture" })) };
    const report = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier }); expect(report.paragraphs[0].sentences[0].claimIds).toEqual(["c1", "c2"]);
  });

  it("rejects cross-Claim excerpts and persists an exact valid binding", async () => {
    const data = await evidenceFixture();
    await expect(createClaimEvidenceCitationBinding({ projectId: data.project.id, documentId: data.document.id, documentVersionId: data.versionId, sectionId: data.section.id, sentenceId: data.sentence.sentenceId, claimId: "claim-b", evidenceExcerptId: data.excerpt.id, workId: data.work.id, citationItemId: data.sentence.citationItemIds![0], relation: "supports" })).rejects.toThrow(/Claim|EvidenceExcerpt/);
    await createClaimEvidenceCitationBinding({ projectId: data.project.id, documentId: data.document.id, documentVersionId: data.versionId, sectionId: data.section.id, sentenceId: data.sentence.sentenceId, claimId: "claim-a", evidenceExcerptId: data.excerpt.id, workId: data.work.id, citationItemId: data.sentence.citationItemIds![0], relation: "supports" });
    const audit = await runCitationAudit({ projectId: data.project.id, documentId: data.document.id, versionId: data.versionId, formal: true }); expect(audit.blockers.some((item) => ["orphan-citation", "orphan-evidence", "binding-excerpt-work-mismatch"].includes(item.code))).toBe(false);
  });

  it("creates new versions for evidenceMode and does not inherit approval", () => {
    const { project, document } = fixture(); const firstVersion = document.currentVersionId!; saveDocumentApproval({ projectId: project.id, documentId: document.id, documentVersionId: firstVersion, decision: "approved", reviewer: "Researcher" });
    const changed = setProjectDocumentEvidenceMode(project.id, document.id, "exploratory"); expect(changed.currentVersionNumber).toBe(document.currentVersionNumber + 1); expect(documentApprovalForVersion(project.id, document.id, changed.currentVersionId!)).toBeUndefined(); expect(documentApprovalForVersion(project.id, document.id, firstVersion)?.decision).toBe("approved");
  });

  it("restores the exact old manuscript and removes later-only chapters", () => {
    const { project, document } = fixture(); const oldVersion = document.currentVersionId!; const later = structuredClone(document.manuscript); const chapter = structuredClone(later.chapters[0]); chapter.id = "later-chapter"; chapter.number = "99"; chapter.title = "Later only"; chapter.sections = chapter.sections.map((section) => ({ ...section, id: "later-section", chapterId: chapter.id, number: "99.1" })); later.chapters.push(chapter); saveProjectDocument(project.id, document.id, later);
    const restored = restoreProjectDocumentVersion(project.id, document.id, oldVersion).document; expect(restored.manuscript.chapters.some((item) => item.id === "later-chapter")).toBe(false); expect(restored.currentVersionNumber).toBeGreaterThan(document.currentVersionNumber);
  });

  it("uses real CSL clusters with stable GB/T numeric numbering", () => {
    const base: Work = { id: "a", authors: "Doe, Jane", year: 2020, title: "Alpha", venue: "Journal", sourceType: "journal-article", group: "理论来源", status: "书目信息已核对", bibliographicStatus: "verified", relevance: "" }; const works = [base, { ...base, id: "b", authors: "Roe, John", year: 2021, title: "Beta" }];
    const rendered = renderCitationTokens("A [[CITE:a]] B [[CITE:b]] Both [[CITE:a;b]] Again [[CITE:a]]", works, ["a", "b"], "gb7714").content; expect(rendered).toContain("[1]"); expect(rendered).toContain("[2]"); expect(rendered).not.toContain("[3]"); expect(rendered).not.toContain("[[CITE:"); expect(referencesFor(works, ["a", "b"], "gb7714")).toHaveLength(2);
  });

  it("renders APA locators through citeproc citation items", () => {
    const work: Work = { id: "locator-work", authors: "Doe, Jane", year: 2020, title: "Locator source", venue: "Journal", sourceType: "journal-article", group: "理论来源", status: "书目信息已核对", bibliographicStatus: "verified", relevance: "" };
    expect(renderCitationCluster({ id: "cluster-locator", items: [{ id: "item-locator", workId: work.id, locatorType: "page", locator: "12" }] }, [work], "apa")).toMatch(/p\. 12/);
  });

  it("persists recoverable workflow progress through human gates", () => {
    const { project, document } = fixture(); const run = startAssistantWorkflow({ projectId: project.id, documentId: document.id, sectionId: document.manuscript.chapters[2].sections[0].id, intent: "section_revision", idempotencyKey: "workflow-fixture" }); advanceAssistantWorkflow(project.id, run.id, "analyzing_section", { tool: "get_section", inputSummary: "chapter 3", outputSummary: "loaded", status: "completed" }); advanceAssistantWorkflow(project.id, run.id, "awaiting_human_verification", { tool: "suggest_evidence_excerpts", inputSummary: "matches", outputSummary: "human review required", status: "completed" });
    const restored = getAssistantWorkflowRun(project.id, run.id)!; expect(restored.state).toBe("awaiting_human_verification"); expect(restored.actions.map((item) => item.tool)).toContain("suggest_evidence_excerpts");
  });

  it("counts JSON-backed Claims and EvidenceExcerpts correctly during migration", async () => {
    const data = await evidenceFixture(); const snapshot = migrationSnapshot(); expect(snapshot.claims).toBe(data.claims.length); expect(snapshot.evidence_excerpts).toBe(1); expect(snapshot.claim_evidence_links).toBe(0);
  });

  it("automatically restores a verified backup after migration failure", () => {
    const { project } = fixture(); const migrationId = `fixture-failure-${Date.now()}`;
    expect(() => runMigration({ id: migrationId, migrate: () => { portfolioDatabaseForTests().exec("CREATE TABLE partial_migration_fixture (id TEXT)"); throw new Error("synthetic migration failure"); } })).toThrow(/verified backup restored/);
    const db = portfolioDatabaseForTests(); expect(db.prepare("SELECT id FROM projects WHERE id=?").get(project.id)).toBeTruthy(); expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='partial_migration_fixture'").get()).toBeUndefined(); expect((db.prepare("PRAGMA integrity_check").get() as Record<string, unknown>).integrity_check).toBe("ok");
  });

  it("keeps GitHub workflow syntax away from illegal job-level runner.temp", () => {
    const workflow = readFileSync(path.join(process.cwd(), ".github/workflows/ci.yml"), "utf8"); expect(workflow).toContain("workflow_dispatch:"); expect(workflow).not.toMatch(/^\s{4}[^\n]+:\n(?:\s{6}[^\n]+\n)*\s{6}env:\n(?:.|\n)*?runner\.temp/m); expect(workflow).toContain("$RUNNER_TEMP");
  });

  it("returns immutable whole-document versions", () => {
    const { project, document } = fixture(); const versions = listDocumentVersions(project.id, document.id); expect(versions[0].documentId).toBe(document.id); expect(versions[0].sections.length).toBeGreaterThan(1); expect(getProjectDocument(project.id, document.id)?.currentVersionId).toBe(versions[0].id);
  });
});

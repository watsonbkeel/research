import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject, portfolioDatabaseForTests } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument, listDocumentVersions, saveProjectDocument, saveProjectSection, setProjectDocumentEvidenceMode } from "@/lib/project-documents";
import { compileClaimCoverage, deterministicClaimCoverageClassifier } from "@/lib/claim-coverage";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
import { saveCandidateRecord, listVerificationEvents, latestPublicationStatusCheck, listQuarantinedDrafts, saveQuarantinedDraft } from "@/lib/evidence-store";
import { verifyCandidateBibliography } from "@/lib/bibliographic-verification";
import { checkPublicationStatus, type PublicationStatusAdapter } from "@/lib/publication-status";
import { referencesFor, renderCitationTokens } from "@/lib/citation-service";
import { runCitationAudit } from "@/lib/citation-audit";
import { planAssistantIntent } from "@/lib/assistant-intent";
import { startAssistantWorkflow } from "@/lib/assistant-workflow";
import type { PublicationStatus, Work } from "@/lib/types";

const directories: string[] = [];
afterEach(() => { const directory = directories.pop(); if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), "p0-production-")); directories.push(directory); process.env.WORKBENCH_DATA_DIR = directory;
  const project = createProject({ titleEn: "Fictional doctoral project", titleZh: "虚构博士项目", field: "Research methods", context: "A fictional context", institution: "Verified Test University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary outcome" });
  return { project, document: ensureProjectProposal(project.id) };
}

describe("P0 production readiness", () => {
  it("separates prospective research from formal evidence mode", () => {
    const { project, document } = fixture();
    expect(document.researchMode).toBe("prospective"); expect(document.evidenceMode).toBe("formal");
    const exploratory = setProjectDocumentEvidenceMode(project.id, document.id, "exploratory");
    expect(exploratory.researchMode).toBe("prospective"); expect(exploratory.evidenceMode).toBe("exploratory");
  });

  it("blocks formal fact prose when the model omitted claims", async () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[0].sections[0];
    section.content = "Published research demonstrates a substantial effect on the outcome."; section.claimIds = [];
    saveProjectDocument(project.id, document.id, document.manuscript);
    const coverage = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier: deterministicClaimCoverageClassifier });
    expect(coverage.status).toBe("blocked"); expect(coverage.blockers.some((issue) => issue.code === "uncovered-published-fact")).toBe(true);
  });

  it("does not require citations for connective text", async () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[0].sections[0]; section.content = "However, the next section proceeds in three steps."; saveProjectDocument(project.id, document.id, document.manuscript);
    const coverage = await compileClaimCoverage({ projectId: project.id, documentId: document.id, classifier: deterministicClaimCoverageClassifier });
    expect(coverage.paragraphs[0].sentences[0].coverageStatus).toBe("not_required");
  });

  it("creates immutable global document versions and rejects stale writes", () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[0].sections[0]; const initial = getProjectDocument(project.id, document.id)!;
    const first = saveProjectSection({ projectId: project.id, documentId: document.id, sectionId: section.id, content: "However, this section outlines the plan.", changeSummary: "first", editor: "researcher", expectedVersion: initial.currentVersionNumber });
    expect(first.documentVersion.versionNumber).toBe(initial.currentVersionNumber + 1);
    expect(() => saveProjectSection({ projectId: project.id, documentId: document.id, sectionId: section.id, content: "stale", changeSummary: "stale", editor: "researcher", expectedVersion: initial.currentVersionNumber })).toThrow(/版本已变化/);
    expect(listDocumentVersions(project.id, document.id)[0].sections.some((item) => item.sectionId === section.id && item.content.includes("outlines"))).toBe(true);
  });

  it("creates a parent-linked global version for a complete manuscript save", () => {
    const { project, document } = fixture(); const before = getProjectDocument(project.id, document.id)!;
    document.manuscript.title = "Fictional revised manuscript";
    const saved = saveProjectDocument(project.id, document.id, document.manuscript, { expectedVersion: before.currentVersionNumber, editor: "test-researcher" });
    const versions = listDocumentVersions(project.id, document.id);
    expect(saved.currentVersionNumber).toBe(before.currentVersionNumber + 1);
    expect(versions[0].parentVersionId).toBe(before.currentVersionId);
    expect(versions[0].createdBy).toBe("test-researcher");
  });

  it("keeps quarantined drafts linked to persisted coverage and citation audit reports", async () => {
    const { project, document } = fixture(); const section = document.manuscript.chapters[0].sections[0];
    const candidate = structuredClone(document); candidate.manuscript.chapters[0].sections[0].content = "Published research demonstrates a fictional effect.";
    const audit = await runCitationAudit({ projectId: project.id, documentId: document.id, versionId: "preflight-fixture", documentOverride: candidate });
    if (!audit.claimCoverageReportId) throw new Error("Citation audit did not retain its claim coverage report ID.");
    const quarantined = saveQuarantinedDraft({ projectId: project.id, documentId: document.id, sectionId: section.id, content: candidate.manuscript.chapters[0].sections[0].content, structuredDraft: { projectId: project.id, documentId: document.id, sectionId: section.id, paragraphs: [{ markdown: candidate.manuscript.chapters[0].sections[0].content, claims: [] }], unsupportedStatements: [], assumptions: [], evidenceGaps: [] }, coverageReportId: audit.claimCoverageReportId, citationAuditReportId: audit.id, blockers: audit.blockers, warnings: audit.warnings, status: "blocked" });
    const stored = listQuarantinedDrafts(project.id, document.id).find((item) => item.id === quarantined.id);
    expect(stored?.coverageReportId).toBe(audit.claimCoverageReportId);
    expect(stored?.citationAuditReportId).toBe(audit.id);
    expect(portfolioDatabaseForTests().prepare("SELECT id FROM claim_coverage_reports WHERE id=?").get(audit.claimCoverageReportId)).toBeTruthy();
    expect(portfolioDatabaseForTests().prepare("SELECT id FROM citation_audits WHERE id=?").get(audit.id)).toBeTruthy();
  });

  it("persists the verified Work id on the immutable verification event", async () => {
    const { project } = fixture(); const candidate = saveCandidateRecord({ projectId: project.id, provider: "crossref", providerRecordId: "10.1000/p0", title: "Fictional verified source", authors: ["Jane Doe"], year: 2025, venue: "Test Journal", doi: "10.1000/p0" });
    const verified = await verifyCandidateBibliography({ projectId: project.id, candidateId: candidate.id, fetchImpl: async () => new Response(JSON.stringify({ message: { DOI: "10.1000/p0", title: ["Fictional verified source"], author: [{ given: "Jane", family: "Doe" }], published: { "date-parts": [[2025]] }, "container-title": ["Test Journal"] } })) });
    const rows = portfolioDatabaseForTests().prepare("SELECT work_id AS workId FROM verification_events WHERE id=?").all(verified.event.id) as Array<{ workId?: string }>;
    expect(rows).toHaveLength(1); expect(rows[0].workId).toBe(verified.work?.id); expect(listVerificationEvents({ workId: verified.work?.id })).toHaveLength(1);
  });

  it.each(["clear", "corrected", "retracted", "expression_of_concern", "unknown"] as PublicationStatus[])("persists %s publication status without promoting unknown to clear", async (status) => {
    const { project } = fixture(); const adapter: PublicationStatusAdapter = { name: "mock-authority", check: async () => ({ checkState: "checked", status, checkedAt: new Date().toISOString(), provider: "mock-authority", relatedItems: [] }) };
    await checkPublicationStatus({ projectId: project.id, workId: `work-${status}`, doi: "10.1000/status", adapter });
    expect(latestPublicationStatusCheck(project.id, `work-${status}`)?.status).toBe(status);
  });

  it("records publication provider failures as failed and unknown", async () => {
    const { project } = fixture(); const adapter: PublicationStatusAdapter = { name: "failed-provider", check: async () => ({ checkState: "failed", status: "unknown", checkedAt: new Date().toISOString(), provider: "failed-provider", relatedItems: [], notes: "offline" }) };
    const result = await checkPublicationStatus({ projectId: project.id, workId: "work-failed", adapter }); expect(result.checkState).toBe("failed"); expect(result.status).toBe("unknown");
  });

  it("renders real APA and GB/T outputs without leaking tokens", () => {
    const work: Work = { id: "work-zh", authors: "王明", year: 2024, title: "虚构研究", venue: "测试学报", sourceType: "journal-article", volume: "2", issue: "1", pages: "10-20", doi: "10.1000/zh", group: "相邻研究", status: "未核验", bibliographicStatus: "verified", relevance: "" };
    const apa = referencesFor([work], [work.id], "apa")[0].text; const gb = referencesFor([work], [work.id], "gb7714")[0].text;
    expect(apa).not.toBe(gb); expect(gb).toMatch(/\[J(?:\/OL)?\]/); expect(renderCitationTokens(`Fact [[CITE:${work.id}]]`, [work], [work.id], "gb7714").content).not.toContain("[[CITE:");
  });

  it("blocks blank or exploratory documents at the unified formal export gate", async () => {
    const { project, document } = fixture(); setProjectDocumentEvidenceMode(project.id, document.id, "exploratory");
    const gate = await checkFormalExportGate({ projectId: project.id, documentId: document.id });
    expect(gate.allowed).toBe(false); expect(gate.blockers.some((item) => item.code === "evidence-mode-not-formal")).toBe(true); expect(gate.blockers.some((item) => item.code === "required-section-empty")).toBe(true);
  });

  it("starts an idempotent multi-step chapter repair workflow", () => {
    const { project, document } = fixture(); const plan = planAssistantIntent("第三章没有参考文献，帮我检查并补充", { projectId: project.id, documentId: document.id });
    expect(plan.intent).toBe("section_revision"); expect(plan.requestedActions).toContain("compile_claim_coverage");
    const first = startAssistantWorkflow({ projectId: project.id, documentId: document.id, sectionId: plan.sectionId, intent: plan.intent, idempotencyKey: "repair-chapter-3" }); const second = startAssistantWorkflow({ projectId: project.id, documentId: document.id, sectionId: plan.sectionId, intent: plan.intent, idempotencyKey: "repair-chapter-3" });
    expect(second.id).toBe(first.id); expect(first.state).toBe("planning");
  });
});

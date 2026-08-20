import { describe, expect, it } from "vitest";
import { seedWorkspace } from "@/data/seed";
import { exportBibtex, exportMarkdown } from "@/lib/exporters";
import { exportDocx } from "@/lib/docx-exporter";
import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import type { WorkspaceData } from "@/lib/types";
import JSZip from "jszip";

const fixtureWorkspace: WorkspaceData = {
  ...seedWorkspace,
  project: { ...seedWorkspace.project, id: "project-fictional-export", titleEn: "Fictional outcome calibration study", titleZh: "虚构结果校准研究", field: "Research methods", context: "A fictional laboratory context", institution: "Example University", primaryOutcome: "Outcome calibration", secondaryOutcome: "Decision confidence" },
  works: [{ id: "work-fictional-1", authors: "Taylor, Alex", year: 2025, title: "A fictional calibration study", venue: "Journal of Example Methods", sourceType: "journal-article", volume: "1", issue: "1", pages: "1-12", doi: "10.5555/fixture.2025.001", group: "方法来源", status: "书目信息已核对", bibliographicStatus: "verified", retractionStatus: "clear", relevance: "Fictional test fixture only" }],
  theories: [{ id: "theory-fictional", name: "Calibration framework", role: "组织框架", use: "Organises the fictional test design.", boundary: "Test fixture only.", sourceWorkIds: ["work-fictional-1"] }],
  experiments: [{ id: "experiment-fictional-1", name: "Fictional Experiment 1", objective: "Estimate a preregistered calibration contrast.", design: "Randomised two-condition design", conditions: ["Control", "Treatment"], constants: ["Procedure"], primaryTest: "Difference in mean outcome calibration", ethics: "Synthetic fixture; no participants." }],
  claims: [{ id: "claim-fictional-1", text: "The fixture registers a methodological source.", kind: "已发表事实", citationIds: ["work-fictional-1"] }],
  novelty: [{ dimension: "Outcome calibration", existing: "Fictional prior method", proposed: "Fictional preregistered comparison", assessment: "尚需人工核验" }],
};

describe("research exports", () => {
  it("exports auditable Markdown with research boundaries", () => {
    const output = exportMarkdown(fixtureWorkspace);
    expect(output).toContain("Auditable novelty evidence");
    expect(output).toContain("Outcome calibration");
    expect(output).toContain("not a completed systematic review");
  });

  it("exports only registered works to BibTeX", () => {
    const output = exportBibtex(fixtureWorkspace);
    expect(output.match(/@article\{/g)).toHaveLength(fixtureWorkspace.works.length);
    expect(output).toContain("10.5555/fixture.2025.001");
    expect(output).toContain("Evidence status");
  });

  it("exports a valid, non-empty Word package", async () => {
    const output = await exportDocx(fixtureWorkspace);
    expect(output.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(output.byteLength).toBeGreaterThan(10_000);
    const archive = await JSZip.loadAsync(output);
    const documentXml = await archive.file("word/document.xml")?.async("string");
    expect(documentXml).toContain(fixtureWorkspace.project.titleEn);
    expect(documentXml).toContain("Fictional Experiment 1");
    expect(documentXml).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("exports a structured English Confirmation Proposal with updateable contents", async () => {
    const now = new Date().toISOString();
    const output = await exportConfirmationProposal({
      formal: false,
      workspace: seedWorkspace,
      manuscript: {
        id: "test-manuscript", documentType: "confirmation-proposal", language: "English", title: seedWorkspace.project.titleEn, version: "v0.1", status: "draft", targetUniversity: "Generic Australian university baseline", targetJournal: "", candidate: "", school: "", supervisors: [],
        chapters: [{ id: "chapter-01", number: "1", title: "Introduction and Research Context", order: 0, targetWords: 1000, status: "planned", sections: [{ id: "chapter-01-main", chapterId: "chapter-01", number: "1.1", title: "Introduction", order: 0, targetWords: 1000, content: "", citationIds: [], evidenceExcerptIds: [], claimIds: [], dependencyIds: [], unsupportedStatements: [], evidenceGaps: [], researchStatus: "planned", status: "draft", humanEditStatus: "ai-generated", locked: false, updatedAt: now }] }, { id: "chapter-09", number: "9", title: "Study 2 Methodology", order: 8, targetWords: 1000, status: "planned", sections: [{ id: "chapter-09-main", chapterId: "chapter-09", number: "9.1", title: "Study 2 Methodology", order: 0, targetWords: 1000, content: "", citationIds: [], evidenceExcerptIds: [], claimIds: [], dependencyIds: [], unsupportedStatements: [], evidenceGaps: [], researchStatus: "planned", status: "draft", humanEditStatus: "ai-generated", locked: false, updatedAt: now }] }],
        glossaryTerms: [{ id: "term-synthetic", term: "Synthetic fixture", definition: "Test-only content with no real research claim." }], figures: [{ id: "figure-1", number: "Figure 1", caption: "Conceptual model.", source: "Registered constructs.", status: "planned" }], tables: [{ id: "table-1", number: "Table 1", caption: "Study matrix.", source: "Registered hypotheses.", status: "planned" }], appendices: [{ id: "appendix-a", number: "Appendix A", title: "Materials", content: "", status: "planned" }], createdAt: now, updatedAt: now,
      },
      researchPlan: { schemaVersion: 1, hypotheses: [], analysisPlans: [], updatedAt: now },
      evidence: [],
      institution: { id: "generic", university: "Generic Australian university baseline", faculty: "", school: "", program: "AQF Level 10 doctoral program", milestoneName: "Confirmation", requiredSections: [], wordLimit: null, pageLimit: null, oralPresentationRequirements: "", panelComposition: "", ethicsPrerequisites: "", dataManagementRequirements: "", aiUseRequirements: "", formattingRequirements: "", officialUrl: "", accessDate: "", verificationStatus: "generic-baseline", notes: "" },
    });
    const archive = await JSZip.loadAsync(output);
    const documentXml = await archive.file("word/document.xml")?.async("string");
    expect(documentXml).toContain("Table of Contents");
    expect(documentXml).toContain("Confirmation Proposal");
    expect(documentXml).toContain("Study 2 Methodology");
    expect(documentXml).toContain("待明确");
  });
});

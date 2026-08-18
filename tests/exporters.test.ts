import { describe, expect, it } from "vitest";
import { seedWorkspace } from "@/data/seed";
import { exportBibtex, exportMarkdown } from "@/lib/exporters";
import { exportDocx } from "@/lib/docx-exporter";
import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import JSZip from "jszip";

describe("research exports", () => {
  it("exports auditable Markdown with research boundaries", () => {
    const output = exportMarkdown(seedWorkspace);
    expect(output).toContain("Auditable novelty evidence");
    expect(output).toContain("Seller-contact intention");
    expect(output).toContain("not a completed systematic review");
  });

  it("exports only registered works to BibTeX", () => {
    const output = exportBibtex(seedWorkspace);
    expect(output.match(/@article\{/g)).toHaveLength(seedWorkspace.works.length);
    expect(output).toContain("10.2307/1879431");
    expect(output).toContain("Evidence status");
  });

  it("exports a valid, non-empty Word package", async () => {
    const output = await exportDocx(seedWorkspace);
    expect(output.subarray(0, 2).toString("ascii")).toBe("PK");
    expect(output.byteLength).toBeGreaterThan(10_000);
    const archive = await JSZip.loadAsync(output);
    const documentXml = await archive.file("word/document.xml")?.async("string");
    expect(documentXml).toContain(seedWorkspace.project.titleEn);
    expect(documentXml).toContain("Experiment 1");
    expect(documentXml).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it("exports a structured English Confirmation Proposal with updateable contents", async () => {
    const now = new Date().toISOString();
    const output = await exportConfirmationProposal({
      workspace: seedWorkspace,
      manuscript: {
        id: "test-manuscript", documentType: "confirmation-proposal", language: "English", title: seedWorkspace.project.titleEn, version: "v0.1", status: "draft", targetUniversity: "Generic Australian university baseline", targetJournal: "", candidate: "", school: "", supervisors: [],
        chapters: [{ id: "chapter-01", number: "1", title: "Introduction and Research Context", order: 0, targetWords: 1000, status: "planned", sections: [{ id: "chapter-01-main", chapterId: "chapter-01", number: "1.1", title: "Introduction", order: 0, targetWords: 1000, content: "", citationIds: [], evidenceExcerptIds: [], claimIds: [], dependencyIds: [], unsupportedStatements: [], evidenceGaps: [], researchStatus: "planned", status: "draft", humanEditStatus: "ai-generated", locked: false, updatedAt: now }] }, { id: "chapter-09", number: "9", title: "Study 2 Methodology", order: 8, targetWords: 1000, status: "planned", sections: [{ id: "chapter-09-main", chapterId: "chapter-09", number: "9.1", title: "Study 2 Methodology", order: 0, targetWords: 1000, content: "", citationIds: [], evidenceExcerptIds: [], claimIds: [], dependencyIds: [], unsupportedStatements: [], evidenceGaps: [], researchStatus: "planned", status: "draft", humanEditStatus: "ai-generated", locked: false, updatedAt: now }] }],
        glossaryTerms: [{ id: "term-c2c", term: "C2C", definition: "Consumer-to-consumer marketplace exchange." }], figures: [{ id: "figure-1", number: "Figure 1", caption: "Conceptual model.", source: "Registered constructs.", status: "planned" }], tables: [{ id: "table-1", number: "Table 1", caption: "Study matrix.", source: "Registered hypotheses.", status: "planned" }], appendices: [{ id: "appendix-a", number: "Appendix A", title: "Materials", content: "", status: "planned" }], createdAt: now, updatedAt: now,
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
    expect(documentXml).not.toMatch(/[\u3400-\u9fff]/u);
  });
});

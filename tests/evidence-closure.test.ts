import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/portfolio";
import { saveCandidateRecord } from "@/lib/evidence-store";
import { verifyCandidateBibliography } from "@/lib/bibliographic-verification";
import { assertFormalCitable, parseCitationTokens, referencesFor, renderCitationTokens } from "@/lib/citation-service";
import { planAssistantIntent } from "@/lib/assistant-intent";
import { runCitationAudit } from "@/lib/citation-audit";
import { getProjectDocument } from "@/lib/project-documents";
import { ensureProjectProposal } from "@/lib/project-documents";
import { importWork, readWorkspace } from "@/lib/storage";
import { saveProjectDocument } from "@/lib/project-documents";
import { parseStructuredSectionDraft } from "@/lib/structured-draft";
import { createEvidenceExcerpt } from "@/lib/evidence-excerpts";
import { bundlePrompt } from "@/lib/evidence-bundle";
import type { Work } from "@/lib/types";

const dirs: string[] = [];
afterEach(() => { const directory = dirs.pop(); if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });
function project() { const directory = mkdtempSync(path.join(tmpdir(), "evidence-closure-")); dirs.push(directory); process.env.WORKBENCH_DATA_DIR = directory; return createProject({ titleEn: "Evidence closure project", titleZh: "证据闭环项目", field: "Marketing", context: "Online market", primaryOutcome: "Trust", secondaryOutcome: "Intention" }); }

describe("evidence closure services", () => {
  it("keeps a DOI candidate unverified until Crossref fields match", async () => {
    const item = project();
    const candidate = saveCandidateRecord({ projectId: item.id, provider: "crossref", providerRecordId: "10.1000/test", title: "A Verified Study", authors: ["Jane Doe"], year: 2024, venue: "Journal of Tests", doi: "10.1000/test" });
    const result = await verifyCandidateBibliography({ projectId: item.id, candidateId: candidate.id, fetchImpl: async () => new Response(JSON.stringify({ message: { DOI: "10.1000/test", title: ["A Verified Study"], author: [{ given: "Jane", family: "Doe" }], published: { "date-parts": [[2024]] }, "container-title": ["Journal of Tests"] } })) });
    expect(result.event.result).toBe("verified"); expect(result.work?.bibliographicStatus).toBe("verified");
  });

  it("does not promote a DOI with mismatched title", async () => {
    const item = project();
    const candidate = saveCandidateRecord({ projectId: item.id, provider: "crossref", providerRecordId: "10.1000/mismatch", title: "Expected Title", authors: ["Jane Doe"], year: 2024, venue: "Journal", doi: "10.1000/mismatch" });
    const result = await verifyCandidateBibliography({ projectId: item.id, candidateId: candidate.id, fetchImpl: async () => new Response(JSON.stringify({ message: { DOI: "10.1000/mismatch", title: ["Different Title"], author: [{ given: "Jane", family: "Doe" }], published: { "date-parts": [[2024]] }, "container-title": ["Journal"] } })) });
    expect(["mismatch", "partial_match"]).toContain(result.event.result); expect(result.work).toBeUndefined();
  });

  it("rejects candidate IDs and unresolved citation tokens", () => {
    const work: Work = { id: "w1", authors: "Doe, Jane", year: 2024, title: "Study", venue: "Journal", doi: "10.1000/w1", group: "相邻研究", status: "未核验", bibliographicStatus: "unverified", relevance: "" };
    expect(() => assertFormalCitable(work)).toThrow(/书目核验/); expect(parseCitationTokens("Text [[CITE:w1]]")).toEqual(["w1"]); expect(renderCitationTokens("Text [[CITE:missing]]", [work]).unknownIds).toEqual(["missing"]); expect(renderCitationTokens("Text [[CITE:w1]]", [{ ...work, bibliographicStatus: "verified" }]).content).not.toContain("[[CITE:");
  });

  it("uses matching author-year suffixes in body citations and references", () => {
    const works: Work[] = [
      { id: "w-a", authors: "Doe, Jane", year: 2024, title: "Alpha study", venue: "Journal", group: "相邻研究", status: "未核验", bibliographicStatus: "verified", relevance: "" },
      { id: "w-b", authors: "Doe, Jane", year: 2024, title: "Beta study", venue: "Journal", group: "相邻研究", status: "未核验", bibliographicStatus: "verified", relevance: "" },
    ];
    const body = renderCitationTokens("One [[CITE:w-a]] two [[CITE:w-b]]", works, ["w-a", "w-b"]).content;
    const references = referencesFor(works, ["w-a", "w-b"]).map((item) => item.text).join("\n");
    expect(body).toContain("2024a"); expect(body).toContain("2024b"); expect(references).toContain("2024a"); expect(references).toContain("2024b");
  });

  it("routes a chapter citation request to citation audit and persists its report", async () => {
    const item = project(); const document = ensureProjectProposal(item.id)!; const section = document.manuscript.chapters[0].sections[0]; const report = await runCitationAudit({ projectId: item.id, documentId: document.id, formal: true });
    expect(report.projectId).toBe(item.id); expect(report.documentId).toBe(document.id); expect(getProjectDocument(item.id, document.id)?.manuscript.chapters[0].sections[0].id).toBe(section.id);
  });

  it("blocks an old or unverified Work during formal citation audit", async () => {
    const item = project();
    await importWork({ title: "Unverified study", authors: "Doe, Jane", year: 2024, venue: "Journal", doi: "10.1000/unverified", relevance: "" }, item.id);
    const workspace = await readWorkspace(item.id);
    const document = ensureProjectProposal(item.id)!;
    const section = document.manuscript.chapters[0].sections[0];
    const work = workspace.works.find((candidate) => candidate.title === "Unverified study")!;
    section.content = `A claim [[CITE:${work.id}]]`;
    section.citationIds = [work.id];
    saveProjectDocument(item.id, document.id, document.manuscript);
    const report = await runCitationAudit({ projectId: item.id, documentId: document.id, formal: true });
    expect(report.status).toBe("blocked");
    expect(report.blockers.some((issue) => issue.code === "work-not-verified")).toBe(true);
  });

  it("rejects citation tokens that are outside the section evidence bundle", () => {
    const bundle = {
      id: "bundle-1", projectId: "project-1", documentId: "document-1", sectionId: "section-1", mode: "formal" as const, createdAt: new Date().toISOString(), unresolvedClaims: [],
      claims: [{ claimId: "claim-1", text: "A published fact", kind: "published_fact" as const, evidence: [{ evidenceExcerptId: "excerpt-1", workId: "work-1", authors: "Doe, Jane", year: 2024, title: "Allowed", venue: "Journal", locator: "p. 2", quote: "private excerpt text", supportDirection: "supporting", strength: "high", verificationStatus: "human_verified", externalModelUsePermission: "prohibited" as const }] }],
    };
    const works = [
      { id: "work-1", authors: "Doe, Jane", year: 2024, title: "Allowed", venue: "Journal", group: "相邻研究" as const, status: "未核验" as const, bibliographicStatus: "verified" as const, relevance: "" },
      { id: "work-2", authors: "Roe, Alex", year: 2023, title: "Outside", venue: "Journal", group: "相邻研究" as const, status: "未核验" as const, bibliographicStatus: "verified" as const, relevance: "" },
    ];
    expect(() => parseStructuredSectionDraft({ projectId: "project-1", documentId: "document-1", sectionId: "section-1", paragraphs: [{ markdown: "Fact [[CITE:work-2]]", claims: [{ claimId: "claim-1", claimText: "A published fact", kind: "published_fact", evidenceExcerptIds: ["excerpt-1"], citationWorkIds: ["work-2"] }] }], unsupportedStatements: [], assumptions: [], evidenceGaps: [] }, bundle, works)).toThrow(/证据包之外/);
    expect(bundlePrompt(bundle, { allowFullText: true })).toContain("EXCERPT TEXT WITHHELD");
    expect(bundlePrompt(bundle, { allowFullText: true })).not.toContain("private excerpt text");
  });

  it("does not allow an EvidenceExcerpt to cross project boundaries", async () => {
    const first = project();
    const imported = await importWork({ title: "First project source", authors: "Doe, Jane", year: 2024, venue: "Journal", doi: "10.1000/first", relevance: "" }, first.id);
    const second = createProject({ titleEn: "Second evidence project", titleZh: "第二项目", field: "Marketing", context: "Online market", primaryOutcome: "Trust", secondaryOutcome: "Intention" });
    await expect(createEvidenceExcerpt({ workId: imported.works.at(-1)?.id ?? "work-from-first", page: 1, quote: "Not available" }, second.id)).rejects.toThrow(/Work不存在/);
    expect(first.id).not.toBe(second.id);
  });

  it("requires reviewer metadata before a project excerpt becomes human_verified", async () => {
    const item = project();
    const candidate = saveCandidateRecord({ projectId: item.id, provider: "crossref", providerRecordId: "10.1000/review", title: "Reviewable study", authors: ["Jane Doe"], year: 2024, venue: "Journal", doi: "10.1000/review" });
    const promoted = await verifyCandidateBibliography({ projectId: item.id, candidateId: candidate.id, fetchImpl: async () => new Response(JSON.stringify({ message: { DOI: "10.1000/review", title: ["Reviewable study"], author: [{ given: "Jane", family: "Doe" }], published: { "date-parts": [[2024]] }, "container-title": ["Journal"] } })) });
    await expect(createEvidenceExcerpt({ workId: promoted.work!.id, page: 1, paraphrase: "A located statement", verificationStatus: "human_verified" }, item.id)).rejects.toThrow(/reviewer/);
  });

  it("re-verifies an existing legacy Work instead of inserting a duplicate", async () => {
    const item = project();
    const workspace = await importWork({ title: "Legacy source", authors: "Doe, Jane", year: 2024, venue: "Journal", doi: "10.1000/legacy", relevance: "" }, item.id);
    const existingId = workspace.works.at(-1)!.id;
    const candidate = saveCandidateRecord({ projectId: item.id, provider: "manual", providerRecordId: "10.1000/legacy", title: "Legacy source", authors: ["Jane Doe"], year: 2024, venue: "Journal", doi: "10.1000/legacy" });
    const result = await verifyCandidateBibliography({ projectId: item.id, candidateId: candidate.id, fetchImpl: async () => new Response(JSON.stringify({ message: { DOI: "10.1000/legacy", title: ["Legacy source"], author: [{ given: "Jane", family: "Doe" }], published: { "date-parts": [[2024]] }, "container-title": ["Journal"] } })) });
    expect(result.work?.id).toBe(existingId); expect(result.work?.bibliographicStatus).toBe("verified");
  });

  it("understands project actions without turning them into idea assessment", () => {
    expect(planAssistantIntent("第三章没有参考文献，帮我检查并补充").intent).toBe("section_revision"); expect(planAssistantIntent("这个概念是什么意思").intent).toBe("qa"); expect(planAssistantIntent("比较三个研究题目").intent).toBe("topic_comparison");
  });
});

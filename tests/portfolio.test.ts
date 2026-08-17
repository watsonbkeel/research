import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addTopicCandidate, createProject, createTopicBatch, listProjects, portfolioDatabase, promoteTopicCandidate, readProjectState, writeProjectState } from "@/lib/portfolio";
import { createJournalArticle, ensureProjectProposal, getProjectDocument, listProjectDocuments, saveProjectSection, setProjectDocumentMode } from "@/lib/project-documents";
import { importWork, readWorkspace } from "@/lib/storage";
import { saveAnalysisRun } from "@/lib/results";

describe("multi-project research portfolio", () => {
  let directory = "";
  beforeEach(() => { directory = mkdtempSync(path.join(tmpdir(), "portfolio-test-")); process.env.WORKBENCH_DATA_DIR = directory; });
  afterEach(() => { delete process.env.WORKBENCH_DATA_DIR; rmSync(directory, { recursive: true, force: true }); });

  function project(title: string) {
    return createProject({ titleEn: title, titleZh: title, field: "Consumer research", context: "Online market", primaryOutcome: "Intention", secondaryOutcome: "Trust" });
  }

  it("migrates the legacy seed and isolates project state", async () => {
    const legacy = await readWorkspace();
    expect(listProjects().some((item) => item.id === legacy.project.id)).toBe(true);
    const left = project("Independent topic A"), right = project("Independent topic B");
    writeProjectState(left.id, "analysis_runs", [{ id: "left-only" }]);
    writeProjectState(right.id, "analysis_runs", [{ id: "right-only" }]);
    expect(readProjectState<Array<{ id: string }>>(left.id, "analysis_runs")).toEqual([{ id: "left-only" }]);
    expect(readProjectState<Array<{ id: string }>>(right.id, "analysis_runs")).toEqual([{ id: "right-only" }]);
  });

  it("promotes a candidate idempotently and creates one proposal", () => {
    const batch = createTopicBatch({ inputMode: "evaluate-only", brief: "Compare supplied topics", requestedCount: 5, seedTopics: ["Topic one", "Topic two"] });
    const candidate = addTopicCandidate(batch.id, { title: "Promotable topic", description: "A defensible empirical topic", status: "evaluated", report: { titleEn: "Promotable topic", titleZh: "可立项主题", field: "Marketing", primaryOutcome: "Trust", secondaryOutcome: "Intention" } });
    const first = promoteTopicCandidate(candidate.id), second = promoteTopicCandidate(candidate.id);
    expect(second.id).toBe(first.id);
    ensureProjectProposal(first.id); ensureProjectProposal(first.id);
    expect(listProjectDocuments(first.id).filter((item) => item.documentType === "confirmation-proposal")).toHaveLength(1);
  });

  it("keeps global bibliography identity while project membership stays separate", async () => {
    await readWorkspace();
    const left = project("Bibliography project A"), right = project("Bibliography project B");
    const work = { title: "Shared DOI record", authors: "Researcher, A.", year: 2024, venue: "Journal", doi: "10.1000/shared", relevance: "Different project relevance" };
    await importWork(work, left.id); await importWork(work, right.id);
    const db = portfolioDatabase();
    expect((db.prepare("SELECT COUNT(*) AS count FROM works WHERE doi=?").get("10.1000/shared") as { count: number }).count).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS count FROM project_works WHERE work_id IN (SELECT id FROM works WHERE doi=?)").get("10.1000/shared") as { count: number }).count).toBe(2);
  });

  it("rejects fabricated prospective results and unlocks empirical mode only after real analysis", () => {
    const item = project("Prospective integrity project");
    const article = createJournalArticle(item.id, { title: "A prospective journal article" });
    const results = article.manuscript.chapters.flatMap((chapter) => chapter.sections).find((section) => /anticipated results/i.test(section.title))!;
    expect(() => saveProjectSection({ projectId: item.id, documentId: article.id, sectionId: results.id, content: "We expect the focal condition to increase the registered outcome.", changeSummary: "Expected pattern", editor: "researcher" })).not.toThrow();
    expect(() => saveProjectSection({ projectId: item.id, documentId: article.id, sectionId: results.id, content: "The study found p < 0.05 and confirmed the hypothesis.", changeSummary: "Invalid result", editor: "researcher" })).toThrow(/预测稿不得包含/);
    expect(() => setProjectDocumentMode(item.id, article.id, "empirical")).toThrow(/AnalysisRun/);
    saveAnalysisRun({ id: "real-run", studyId: "study-1", datasetVersionId: "dataset-v1", status: "completed", isRealData: true, sampleN: 100, scriptPath: "analysis.R", environment: "R", outputChecksum: "checksum", ranAt: new Date().toISOString(), resultEstimates: [], robustnessChecks: [], notes: "Reproducible run" }, item.id);
    expect(setProjectDocumentMode(item.id, article.id, "empirical").mode).toBe("empirical");
    expect(getProjectDocument(item.id, article.id)?.manuscript.chapters.flatMap((chapter) => chapter.sections).some((section) => section.title === "Results")).toBe(true);
  });
});

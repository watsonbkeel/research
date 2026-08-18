import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultManuscript, manuscriptSchema, type DraftVersion, type Manuscript, type ManuscriptSection } from "./manuscript";
import { getProject, portfolioDatabase } from "./portfolio";
import { hasCompletedRealAnalysis } from "./results";

export type DocumentMode = "prospective" | "empirical";
export type ProjectDocument = {
  id: string;
  projectId: string;
  documentType: "confirmation-proposal" | "journal-article";
  mode: DocumentMode;
  title: string;
  status: string;
  targetVenue: string;
  manuscript: Manuscript;
  createdAt: string;
  updatedAt: string;
};

const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

function rowToDocument(row: Record<string, unknown>): ProjectDocument {
  const manuscript = manuscriptSchema.parse(parse(row.contentJson, {}));
  return { id: String(row.id), projectId: String(row.projectId), documentType: row.documentType as ProjectDocument["documentType"], mode: row.mode as DocumentMode, title: String(row.title), status: String(row.status), targetVenue: String(row.targetVenue), manuscript, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
}

function makeArticleManuscript(title: string, targetJournal = ""): Manuscript {
  const timestamp = now();
  const documentId = `article-${randomUUID()}`;
  const chapterTitles = [
    "Title, Abstract and Keywords", "Introduction", "Critical Literature Review", "Theoretical Framework and Hypotheses",
    "Method", "Anticipated Results", "Conditional Discussion", "Theoretical and Practical Implications", "Limitations and Future Research", "References and Appendices",
  ];
  const chapters = chapterTitles.map((chapterTitle, index) => {
    const chapterId = `${documentId}-chapter-${index + 1}`;
    const section: ManuscriptSection = {
      id: `${chapterId}-main`, chapterId, number: `${index + 1}.1`, title: chapterTitle, order: 0,
      targetWords: index === 0 ? 350 : index === 4 ? 1800 : 1000, content: "", citationIds: [], evidenceExcerptIds: [], claimIds: [], dependencyIds: [], unsupportedStatements: [], evidenceGaps: [],
      researchStatus: "planned", status: "draft", humanEditStatus: "ai-generated", locked: false, updatedAt: timestamp,
    };
    return { id: chapterId, number: String(index + 1), title: chapterTitle, order: index, targetWords: section.targetWords, status: "planned" as const, sections: [section] };
  });
  return {
    id: documentId, documentType: "journal-article", language: "English", title, version: "v0.1", status: "draft",
    targetUniversity: "", targetJournal, candidate: "", school: "", supervisors: [], chapters, glossaryTerms: [], figures: [], tables: [], appendices: [],
    createdAt: timestamp, updatedAt: timestamp,
  };
}

function insertDocument(projectId: string, manuscript: Manuscript, mode: DocumentMode): ProjectDocument {
  const timestamp = now();
  portfolioDatabase().prepare(`INSERT INTO documents (id,project_id,document_type,mode,title,status,target_venue,content_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(manuscript.id, projectId, manuscript.documentType, mode, manuscript.title, manuscript.status, manuscript.targetJournal || manuscript.targetUniversity, JSON.stringify(manuscript), timestamp, timestamp);
  return getProjectDocument(projectId, manuscript.id)!;
}

export function ensureProjectProposal(projectId: string) {
  const existing = listProjectDocuments(projectId).find((document) => document.documentType === "confirmation-proposal");
  if (existing) return existing;
  const project = getProject(projectId); if (!project) throw new Error("项目不存在。");
  const manuscript = defaultManuscript(project.titleEn);
  manuscript.id = `proposal-${randomUUID()}`;
  manuscript.title = project.titleEn;
  manuscript.targetUniversity = project.institution;
  return insertDocument(projectId, manuscript, "prospective");
}

export function listProjectDocuments(projectId: string): ProjectDocument[] {
  if (!getProject(projectId)) throw new Error("项目不存在。");
  return (portfolioDatabase().prepare(`SELECT id,project_id AS projectId,document_type AS documentType,mode,title,status,target_venue AS targetVenue,
    content_json AS contentJson,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE project_id=? ORDER BY created_at`).all(projectId) as Array<Record<string, unknown>>).map(rowToDocument);
}

export function getProjectDocument(projectId: string, documentId: string): ProjectDocument | undefined {
  const row = portfolioDatabase().prepare(`SELECT id,project_id AS projectId,document_type AS documentType,mode,title,status,target_venue AS targetVenue,
    content_json AS contentJson,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE project_id=? AND id=?`).get(projectId, documentId) as Record<string, unknown> | undefined;
  return row ? rowToDocument(row) : undefined;
}

export function createJournalArticle(projectId: string, input: { title: string; targetJournal?: string }) {
  if (!getProject(projectId)) throw new Error("项目不存在。");
  return insertDocument(projectId, makeArticleManuscript(input.title, input.targetJournal), "prospective");
}

export function saveProjectDocument(projectId: string, documentId: string, input: Manuscript) {
  const current = getProjectDocument(projectId, documentId); if (!current) throw new Error("文档不存在。");
  const manuscript = manuscriptSchema.parse({ ...input, id: documentId, documentType: current.documentType, updatedAt: now() });
  portfolioDatabase().prepare("UPDATE documents SET title=?,status=?,target_venue=?,content_json=?,updated_at=? WHERE project_id=? AND id=?")
    .run(manuscript.title, manuscript.status, manuscript.targetJournal || manuscript.targetUniversity, JSON.stringify(manuscript), manuscript.updatedAt, projectId, documentId);
  return getProjectDocument(projectId, documentId)!;
}

export function setProjectDocumentMode(projectId: string, documentId: string, mode: DocumentMode) {
  const document = getProjectDocument(projectId, documentId); if (!document) throw new Error("文档不存在。");
  if (mode === "empirical" && !hasCompletedRealAnalysis(undefined, projectId)) throw new Error("没有完成且标记为真实数据的 AnalysisRun，不能转为 empirical 模式。");
  if (mode === "empirical") {
    for (const chapter of document.manuscript.chapters) for (const section of chapter.sections) {
      if (/anticipated results/i.test(section.title)) section.title = "Results";
      if (/conditional discussion/i.test(section.title)) section.title = "Discussion";
    }
  }
  document.manuscript.updatedAt = now();
  portfolioDatabase().prepare("UPDATE documents SET mode=?,content_json=?,updated_at=? WHERE project_id=? AND id=?").run(mode, JSON.stringify(document.manuscript), document.manuscript.updatedAt, projectId, documentId);
  return getProjectDocument(projectId, documentId)!;
}

const forbiddenProspectivePatterns = [
  /\b(?:p\s*[<=>]|confidence interval|\bCI\s*[=:]|standard error|effect size)\s*[-+]?\d/i,
  /\b(?:we|the study|the results?)\s+(?:found|showed|demonstrated|revealed|confirmed)\b/i,
  /\b(?:participants?|sample)\s+(?:were|was|consisted of|included)\s+\d+/i,
];

export function assertProspectiveIntegrity(section: Pick<ManuscriptSection, "title" | "content">) {
  if (!/result|discussion/i.test(section.title)) return;
  const violation = forbiddenProspectivePatterns.find((pattern) => pattern.test(section.content));
  if (violation) throw new Error("预测稿不得包含已完成研究语气、样本事实或统计结果；请改写为预期方向和条件式解释。");
}

export function saveProjectSection(input: { projectId: string; documentId: string; sectionId: string; content: string; changeSummary: string; editor: string; generatedBy?: string; citationIds?: string[]; claimIds?: string[]; evidenceExcerptIds?: string[]; evidenceBundleId?: string; unsupportedStatements?: Array<{ statement: string; reason: string }>; evidenceGaps?: string[] }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。");
  const manuscript = document.manuscript;
  const section = manuscript.chapters.flatMap((chapter) => chapter.sections).find((candidate) => candidate.id === input.sectionId);
  if (!section) throw new Error("章节不存在。");
  if (section.locked) throw new Error("该章节已锁定。");
  const candidate = { ...section, content: input.content };
  if (document.mode === "prospective") assertProspectiveIntegrity(candidate);
  const count = portfolioDatabase().prepare("SELECT COUNT(*) AS count FROM document_versions WHERE document_id=? AND section_id=?").get(input.documentId, input.sectionId) as { count: number };
  const timestamp = now();
  const version: DraftVersion = {
    id: `draft-${randomUUID()}`, manuscriptId: input.documentId, sectionId: section.id, versionNumber: count.count + 1, content: input.content,
    citationIds: input.citationIds ?? section.citationIds, claimIds: input.claimIds ?? section.claimIds, evidenceExcerptIds: input.evidenceExcerptIds ?? section.evidenceExcerptIds, evidenceBundleId: input.evidenceBundleId ?? section.evidenceBundleId, unsupportedStatements: input.unsupportedStatements ?? section.unsupportedStatements, evidenceGaps: input.evidenceGaps ?? section.evidenceGaps,
    changeSummary: input.changeSummary, editor: input.editor, generatedBy: input.generatedBy, researchStatus: section.researchStatus, manuscriptStatus: "draft", createdAt: timestamp,
  };
  section.content = input.content; section.citationIds = input.citationIds ?? section.citationIds; section.claimIds = input.claimIds ?? section.claimIds; section.evidenceExcerptIds = input.evidenceExcerptIds ?? section.evidenceExcerptIds; section.evidenceBundleId = input.evidenceBundleId ?? section.evidenceBundleId; section.unsupportedStatements = input.unsupportedStatements ?? section.unsupportedStatements; section.evidenceGaps = input.evidenceGaps ?? section.evidenceGaps; section.updatedAt = timestamp; section.generatedBy = input.generatedBy; section.generatedAt = input.generatedBy ? timestamp : section.generatedAt;
  section.humanEditStatus = input.generatedBy ? "ai-generated" : "human-edited";
  manuscript.updatedAt = timestamp; manuscript.version = `v0.${Math.max(1, count.count + 1)}`;
  portfolioDatabase().prepare("INSERT INTO document_versions VALUES (?,?,?,?,?,?)").run(version.id, input.documentId, section.id, version.versionNumber, JSON.stringify(version), timestamp);
  saveProjectDocument(input.projectId, input.documentId, manuscript);
  return { document: getProjectDocument(input.projectId, input.documentId)!, version };
}

export function listProjectDocumentVersions(projectId: string, documentId: string, sectionId?: string) {
  if (!getProjectDocument(projectId, documentId)) throw new Error("文档不存在。");
  const rows = sectionId
    ? portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_versions WHERE document_id=? AND section_id=? ORDER BY version_number DESC").all(documentId, sectionId)
    : portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_versions WHERE document_id=? ORDER BY created_at DESC").all(documentId);
  return (rows as Array<{ payload: string }>).map((row) => z.object({}).passthrough().parse(parse(row.payload, {})) as DraftVersion);
}

export function restoreProjectDocumentVersion(projectId: string, documentId: string, versionId: string) {
  const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_versions WHERE id=? AND document_id=?").get(versionId, documentId) as { payload: string } | undefined;
  if (!row) throw new Error("DraftVersion不存在。");
  const version = parse<DraftVersion>(row.payload, undefined as unknown as DraftVersion);
  return saveProjectSection({ projectId, documentId, sectionId: version.sectionId, content: version.content, changeSummary: `Restored from ${version.id}`, editor: "researcher" });
}

export type PaperConcept = { id: string; projectId: string; title: string; centralQuestion: string; contribution: string; linkedStudyIds: string[]; linkedHypothesisIds: string[]; targetJournal: string; status: "suggested" | "confirmed" | "rejected"; overlapWarning: string; createdAt: string; updatedAt: string };
export const paperConceptInputSchema = z.object({ title: z.string().min(3).max(1000), centralQuestion: z.string().min(3).max(3000), contribution: z.string().min(3).max(3000), linkedStudyIds: z.array(z.string().max(120)).max(20).default([]), linkedHypothesisIds: z.array(z.string().max(120)).max(50).default([]), targetJournal: z.string().max(300).default(""), overlapWarning: z.string().max(2000).default("") });
function conceptRow(row: Record<string, unknown>): PaperConcept { return { id: String(row.id), projectId: String(row.projectId), title: String(row.title), centralQuestion: String(row.centralQuestion), contribution: String(row.contribution), linkedStudyIds: parse(row.linkedStudyIds, []), linkedHypothesisIds: parse(row.linkedHypothesisIds, []), targetJournal: String(row.targetJournal), status: row.status as PaperConcept["status"], overlapWarning: String(row.overlapWarning), createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) }; }
export function listPaperConcepts(projectId: string) { return (portfolioDatabase().prepare("SELECT id,project_id AS projectId,title,central_question AS centralQuestion,contribution,linked_study_ids AS linkedStudyIds,linked_hypothesis_ids AS linkedHypothesisIds,target_journal AS targetJournal,status,overlap_warning AS overlapWarning,created_at AS createdAt,updated_at AS updatedAt FROM paper_concepts WHERE project_id=? ORDER BY created_at").all(projectId) as Array<Record<string, unknown>>).map(conceptRow); }
export function createPaperConcept(projectId: string, input: z.input<typeof paperConceptInputSchema>) { const value = paperConceptInputSchema.parse(input), id = `paper-concept-${randomUUID()}`, timestamp = now(); portfolioDatabase().prepare("INSERT INTO paper_concepts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").run(id, projectId, value.title, value.centralQuestion, value.contribution, JSON.stringify(value.linkedStudyIds), JSON.stringify(value.linkedHypothesisIds), value.targetJournal, "suggested", value.overlapWarning, timestamp, timestamp); return listPaperConcepts(projectId).find((item) => item.id === id)!; }
export function confirmPaperConcept(projectId: string, conceptId: string) { const concept = listPaperConcepts(projectId).find((item) => item.id === conceptId); if (!concept) throw new Error("论文建议不存在。"); const existing = portfolioDatabase().prepare("SELECT id FROM documents WHERE project_id=? AND content_json LIKE ?").get(projectId, `%${conceptId}%`) as { id: string } | undefined; if (existing) return getProjectDocument(projectId, existing.id)!; const article = createJournalArticle(projectId, { title: concept.title, targetJournal: concept.targetJournal }); article.manuscript.appendices.push({ id: `concept-link-${concept.id}`, number: "Planning provenance", title: "Paper concept provenance", content: JSON.stringify({ conceptId: concept.id, linkedStudyIds: concept.linkedStudyIds, linkedHypothesisIds: concept.linkedHypothesisIds }), status: "planned" }); saveProjectDocument(projectId, article.id, article.manuscript); portfolioDatabase().prepare("UPDATE paper_concepts SET status='confirmed',updated_at=? WHERE id=?").run(now(), conceptId); return getProjectDocument(projectId, article.id)!; }

export function prospectiveWatermark(document: ProjectDocument) {
  return document.mode === "prospective" ? "PROSPECTIVE DRAFT — NO EMPIRICAL RESULTS" : "";
}

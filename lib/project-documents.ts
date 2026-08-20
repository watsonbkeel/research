import { randomUUID } from "node:crypto";
import { z } from "zod";
import { defaultManuscript, manuscriptSchema, type DraftVersion, type Manuscript, type ManuscriptSection } from "./manuscript";
import { getProject, portfolioDatabase, updateProject } from "./portfolio";
import { hasCompletedRealAnalysis } from "./results";
import { createHash } from "node:crypto";
import type { DocumentVersion, EvidenceLocatorType, EvidenceMode, ResearchMode } from "./types";
import { readWorkspaceState } from "./storage";
import { institutionProfileSchema, readInstitutionProfile, saveInstitutionProfile } from "./institution";
import type { InstitutionProfile } from "./institution";
import type { ResearchPlanState } from "./research-plan";
import type { EvidenceExcerpt } from "./evidence-excerpts";
import type { WorkspaceData } from "./types";

export type DocumentMode = ResearchMode;
export type ProjectDocument = {
  id: string;
  projectId: string;
  documentType: "confirmation-proposal" | "journal-article";
  mode: DocumentMode;
  researchMode: ResearchMode;
  evidenceMode: EvidenceMode;
  currentVersionId?: string;
  currentVersionNumber: number;
  title: string;
  status: string;
  targetVenue: string;
  manuscript: Manuscript;
  createdAt: string;
  updatedAt: string;
  versionSnapshot?: DocumentVersion;
};

const now = () => new Date().toISOString();
const parse = <T>(value: unknown, fallback: T): T => { try { return JSON.parse(String(value)) as T; } catch { return fallback; } };

function snapshotCitationData(document: ProjectDocument) {
  const citationItems: NonNullable<DocumentVersion["citationItems"]> = [];
  const citationClusters: NonNullable<DocumentVersion["citationClusters"]> = [];
  let paragraphNumber = 0;
  let documentOrder = 0;
  const chapters = [...document.manuscript.chapters].sort((left, right) => left.order - right.order);
  for (const chapter of chapters) {
    const sections = [...chapter.sections].sort((left, right) => left.order - right.order);
    for (const section of sections) {
    let sectionCursor = 0;
    for (const raw of section.content.split(/\n\s*\n/u)) {
      const leading = section.content.indexOf(raw, sectionCursor); if (leading < 0 || !raw.trim()) { sectionCursor += raw.length + 2; continue; } sectionCursor = leading + raw.length; paragraphNumber += 1;
      const paragraphId = `${section.id}-p${paragraphNumber}`; let citationNumber = 0;
      for (const match of raw.matchAll(/\[\[CITE:([^\]]+)\]\]/g)) {
        const workIds = (match[1] ?? "").split(";").map((item) => item.trim()).filter(Boolean); const items = workIds.map((workId, index) => ({ id: `${paragraphId}-citation-${citationNumber + index + 1}`, workId })); citationNumber += items.length;
        documentOrder += 1;
        citationItems.push(...items); citationClusters.push({ id: `${paragraphId}-cluster-${documentOrder}`, sectionId: section.id, sentenceId: "", documentOrder, position: leading + (match.index ?? 0), mode: "parenthetical", items });
      }
    }
    }
  }
  return { citationItems, citationClusters };
}

export function hydrateCitationItemsFromBindings(version: DocumentVersion): DocumentVersion {
  const hydrated = structuredClone(version);
  const items = new Map((hydrated.citationItems ?? []).map((item) => [item.id, item]));
  const excerpts = new Map(
    (hydrated.evidenceExcerptsSnapshot ?? []).flatMap((value) => {
      if (!value || typeof value !== "object" || !("id" in value)) return [];
      return [[String(value.id), value as { id: string; workId?: string; page?: string; locatorType?: EvidenceLocatorType; locator?: string }]] as const;
    }),
  );

  for (const binding of hydrated.claimEvidenceCitationBindings ?? []) {
    const item = items.get(binding.citationItemId);
    const excerpt = excerpts.get(binding.evidenceExcerptId);
    if (!item || item.workId !== binding.workId || !excerpt || excerpt.workId !== binding.workId) continue;
    if (item.locator) continue;
    if (excerpt.page) {
      item.locatorType = "page";
      item.locator = excerpt.page;
    } else if (excerpt.locator && excerpt.locatorType) {
      item.locatorType = excerpt.locatorType;
      item.locator = excerpt.locator;
    }
  }

  for (const cluster of hydrated.citationClusters ?? []) {
    cluster.items = cluster.items.map((item) => items.get(item.id) ?? item);
  }
  hydrated.citationItems = [...items.values()];
  return hydrated;
}

function buildDocumentVersion(projectId: string, document: ProjectDocument, input: { id: string; versionNumber: number; parentVersionId?: string; createdBy: string; createdAt: string; lifecycleStatus?: DocumentVersion["lifecycleStatus"]; idempotencyKey?: string }) {
  const workspace = readWorkspaceState<import("./types").WorkspaceData>("workspace", projectId);
  const researchPlan = readWorkspaceState<unknown>("research_plan", projectId) ?? { schemaVersion: 1, hypotheses: [], analysisPlans: [] };
  const evidence = readWorkspaceState<Array<{ id: string; workId: string; verificationStatus: string; page?: string; locatorType?: EvidenceLocatorType; locator?: string; quote?: string; paraphrase?: string }>>("evidence_excerpts", projectId) ?? [];
  const citation = snapshotCitationData(document); const project = getProject(projectId);
  const hasPublicationChecks = portfolioDatabase().prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='publication_status_checks'").get(); const publicationStatusSnapshot = hasPublicationChecks ? (portfolioDatabase().prepare("SELECT payload_json AS payload FROM publication_status_checks WHERE project_id=? ORDER BY checked_at").all(projectId) as Array<{ payload: string }>).map((row) => parse<import("./types").PublicationStatusCheckResult>(row.payload, {} as import("./types").PublicationStatusCheckResult)) : [];
  const snapshot: DocumentVersion = { id: input.id, projectId, documentId: document.id, versionNumber: input.versionNumber, parentVersionId: input.parentVersionId, title: document.title, researchMode: document.researchMode, evidenceMode: document.evidenceMode, targetVenue: document.targetVenue, citationStyle: project?.citationStyle ?? "APA 7", manuscriptSnapshot: structuredClone(document.manuscript), sections: document.manuscript.chapters.flatMap((chapter) => chapter.sections).map((section) => ({ sectionId: section.id, chapterId: section.chapterId, title: section.title, order: section.order, content: section.content, claimIds: section.claimIds, citationIds: section.citationIds, citationItemIds: citation.citationClusters.filter((cluster) => cluster.sectionId === section.id).flatMap((cluster) => cluster.items.map((item) => item.id)), evidenceExcerptIds: section.evidenceExcerptIds, evidenceBundleId: section.evidenceBundleId, unsupportedStatements: section.unsupportedStatements, evidenceGaps: section.evidenceGaps, contentHash: contentHash(section.content) })), claims: structuredClone(workspace?.claims ?? []), works: structuredClone(workspace?.works ?? []), citationItems: citation.citationItems, citationClusters: citation.citationClusters, claimEvidenceCitationBindings: [], evidenceReferences: evidence.map((item) => ({ evidenceExcerptId: item.id, evidenceExcerptHash: contentHash(JSON.stringify({ quote: item.quote, paraphrase: item.paraphrase, page: item.page, locatorType: item.page ? "page" : item.locatorType, locator: item.locator, verificationStatus: item.verificationStatus, workId: item.workId })), workId: item.workId, verificationStatus: item.verificationStatus, page: item.page, locatorType: item.page ? "page" : item.locatorType, locator: item.locator })), evidenceExcerptsSnapshot: structuredClone(evidence), publicationStatusSnapshot, workspaceSnapshot: structuredClone(workspace), researchPlanSnapshot: structuredClone(researchPlan), researchQuestionsSnapshot: structuredClone(readWorkspaceState<unknown>("research_questions", projectId) ?? []), constructsSnapshot: structuredClone(workspace?.constructs ?? []), hypothesesSnapshot: structuredClone((researchPlan as { hypotheses?: unknown }).hypotheses ?? []), experimentsSnapshot: structuredClone(workspace?.experiments ?? []), institutionProfileSnapshot: structuredClone(readInstitutionProfile(projectId)), approvalStatus: "not_reviewed", lifecycleStatus: input.lifecycleStatus ?? "reviewable", idempotencyKey: input.idempotencyKey, createdBy: input.createdBy, createdAt: input.createdAt };
  snapshot.contentHash = documentVersionContentHash(snapshot);
  snapshot.evidenceBindingHash = documentVersionEvidenceBindingHash(snapshot);
  snapshot.proposalInputHash = documentVersionProposalInputHash(snapshot);
  return snapshot;
}

function rowToDocument(row: Record<string, unknown>): ProjectDocument {
  const manuscript = manuscriptSchema.parse(parse(row.contentJson, {}));
  const researchMode = (row.researchMode ?? row.mode ?? "prospective") as ResearchMode;
  const document: ProjectDocument = { id: String(row.id), projectId: String(row.projectId), documentType: row.documentType as ProjectDocument["documentType"], mode: researchMode, researchMode, evidenceMode: (row.evidenceMode ?? "exploratory") as EvidenceMode, currentVersionId: row.currentVersionId ? String(row.currentVersionId) : undefined, currentVersionNumber: Number(row.currentVersionNumber ?? 0), title: String(row.title), status: String(row.status), targetVenue: String(row.targetVenue), manuscript, createdAt: String(row.createdAt), updatedAt: String(row.updatedAt) };
  ensureInitialSnapshot(document);
  return document;
}

function ensureInitialSnapshot(document: ProjectDocument) {
  if (document.currentVersionNumber > 0) return;
  const db = portfolioDatabase(); const existing = db.prepare("SELECT id,version_number AS versionNumber FROM document_snapshots WHERE project_id=? AND document_id=? ORDER BY version_number DESC LIMIT 1").get(document.projectId, document.id) as { id: string; versionNumber: number } | undefined;
  if (existing) {
    db.prepare("UPDATE documents SET current_version_id=?,current_version_number=? WHERE project_id=? AND id=?").run(existing.id, existing.versionNumber, document.projectId, document.id);
    document.currentVersionId = existing.id; document.currentVersionNumber = existing.versionNumber;
    return;
  }
  const createdAt = now(); const snapshot = buildDocumentVersion(document.projectId, document, { id: `document-version-${randomUUID()}`, versionNumber: 1, createdBy: "migration", createdAt });
  db.prepare("INSERT INTO document_snapshots (id,project_id,document_id,version_number,parent_version_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?)").run(snapshot.id, snapshot.projectId, snapshot.documentId, snapshot.versionNumber, null, JSON.stringify(snapshot), createdAt);
  db.prepare("UPDATE documents SET current_version_id=?,current_version_number=? WHERE project_id=? AND id=?").run(snapshot.id, 1, document.projectId, document.id);
  document.currentVersionId = snapshot.id; document.currentVersionNumber = 1;
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

function insertDocument(projectId: string, manuscript: Manuscript, mode: ResearchMode, evidenceMode: EvidenceMode = "formal"): ProjectDocument {
  const timestamp = now();
  portfolioDatabase().prepare(`INSERT INTO documents (id,project_id,document_type,mode,research_mode,evidence_mode,title,status,target_venue,content_json,current_version_number,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(manuscript.id, projectId, manuscript.documentType, mode, mode, evidenceMode, manuscript.title, manuscript.status, manuscript.targetJournal || manuscript.targetUniversity, JSON.stringify(manuscript), 0, timestamp, timestamp);
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
  return insertDocument(projectId, manuscript, "prospective", "formal");
}

export function listProjectDocuments(projectId: string): ProjectDocument[] {
  if (!getProject(projectId)) throw new Error("项目不存在。");
  return (portfolioDatabase().prepare(`SELECT id,project_id AS projectId,document_type AS documentType,mode,research_mode AS researchMode,evidence_mode AS evidenceMode,current_version_id AS currentVersionId,current_version_number AS currentVersionNumber,title,status,target_venue AS targetVenue,
    content_json AS contentJson,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE project_id=? ORDER BY created_at`).all(projectId) as Array<Record<string, unknown>>).map(rowToDocument);
}

export function getProjectDocument(projectId: string, documentId: string): ProjectDocument | undefined {
  const row = portfolioDatabase().prepare(`SELECT id,project_id AS projectId,document_type AS documentType,mode,research_mode AS researchMode,evidence_mode AS evidenceMode,current_version_id AS currentVersionId,current_version_number AS currentVersionNumber,title,status,target_venue AS targetVenue,
    content_json AS contentJson,created_at AS createdAt,updated_at AS updatedAt FROM documents WHERE project_id=? AND id=?`).get(projectId, documentId) as Record<string, unknown> | undefined;
  return row ? rowToDocument(row) : undefined;
}

export function createJournalArticle(projectId: string, input: { title: string; targetJournal?: string }) {
  if (!getProject(projectId)) throw new Error("项目不存在。");
  return insertDocument(projectId, makeArticleManuscript(input.title, input.targetJournal), "prospective");
}

function updateProjectDocumentContent(projectId: string, documentId: string, input: Manuscript, documentType: ProjectDocument["documentType"]) {
  const manuscript = manuscriptSchema.parse({ ...input, id: documentId, documentType, updatedAt: now() });
  portfolioDatabase().prepare("UPDATE documents SET title=?,status=?,target_venue=?,content_json=?,updated_at=? WHERE project_id=? AND id=?")
    .run(manuscript.title, manuscript.status, manuscript.targetJournal || manuscript.targetUniversity, JSON.stringify(manuscript), manuscript.updatedAt, projectId, documentId);
  return manuscript;
}

export function saveProjectDocument(projectId: string, documentId: string, input: Manuscript, options: { expectedVersion?: number; editor?: string } = {}) {
  const current = getProjectDocument(projectId, documentId); if (!current) throw new Error("文档不存在。");
  const db = portfolioDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const versionRow = db.prepare("SELECT current_version_number AS versionNumber FROM documents WHERE project_id=? AND id=?").get(projectId, documentId) as { versionNumber: number } | undefined;
    if (options.expectedVersion !== undefined && Number(versionRow?.versionNumber ?? 0) !== options.expectedVersion) throw new Error("文档版本已变化，请刷新后重试。");
    updateProjectDocumentContent(projectId, documentId, input, current.documentType);
    const savedDocument = getProjectDocument(projectId, documentId)!;
    createDocumentSnapshot(projectId, savedDocument, options.editor ?? "researcher");
    db.exec("COMMIT");
    return getProjectDocument(projectId, documentId)!;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
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
  const db = portfolioDatabase(); db.exec("BEGIN IMMEDIATE");
  try { db.prepare("UPDATE documents SET mode=?,research_mode=?,content_json=?,updated_at=? WHERE project_id=? AND id=?").run(mode, mode, JSON.stringify(document.manuscript), document.manuscript.updatedAt, projectId, documentId); const saved = getProjectDocument(projectId, documentId)!; createDocumentSnapshot(projectId, saved, "researcher"); db.exec("COMMIT"); return getProjectDocument(projectId, documentId)!; } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function setProjectDocumentEvidenceMode(projectId: string, documentId: string, evidenceMode: EvidenceMode) {
  const document = getProjectDocument(projectId, documentId); if (!document) throw new Error("文档不存在。");
  const db = portfolioDatabase(); db.exec("BEGIN IMMEDIATE");
  try { db.prepare("UPDATE documents SET evidence_mode=?,updated_at=? WHERE project_id=? AND id=?").run(evidenceMode, now(), projectId, documentId); const saved = getProjectDocument(projectId, documentId)!; createDocumentSnapshot(projectId, saved, "researcher"); db.exec("COMMIT"); return getProjectDocument(projectId, documentId)!; } catch (error) { db.exec("ROLLBACK"); throw error; }
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

export function contentHash(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function documentVersionContentHash(version: DocumentVersion) { return contentHash(JSON.stringify({ title: version.title, researchMode: version.researchMode, evidenceMode: version.evidenceMode, targetVenue: version.targetVenue, citationStyle: version.citationStyle, sections: version.sections.map((section) => ({ sectionId: section.sectionId, chapterId: section.chapterId, title: section.title, order: section.order, content: section.content, claimIds: section.claimIds, citationIds: section.citationIds, evidenceExcerptIds: section.evidenceExcerptIds, evidenceBundleId: section.evidenceBundleId, unsupportedStatements: section.unsupportedStatements, evidenceGaps: section.evidenceGaps })), citationItems: version.citationItems ?? [], citationClusters: version.citationClusters ?? [] })); }
export function documentVersionEvidenceBindingHash(version: DocumentVersion) { return contentHash(JSON.stringify({ bindings: version.claimEvidenceCitationBindings ?? [], evidence: version.evidenceReferences ?? [] })); }
export function documentVersionProposalInputHash(version: DocumentVersion) { return contentHash(JSON.stringify({ workspace: version.workspaceSnapshot, researchPlan: version.researchPlanSnapshot, institution: version.institutionProfileSnapshot, citationStyle: version.citationStyle })); }
export function projectDocumentContentHash(document: ProjectDocument) {
  if (document.versionSnapshot) return documentVersionContentHash(document.versionSnapshot);
  return documentVersionContentHash({ id: "hash", projectId: document.projectId, documentId: document.id, versionNumber: document.currentVersionNumber, title: document.title, researchMode: document.researchMode, evidenceMode: document.evidenceMode, targetVenue: document.targetVenue, citationStyle: "APA 7", sections: document.manuscript.chapters.flatMap((chapter) => chapter.sections).map((section) => ({ sectionId: section.id, chapterId: section.chapterId, title: section.title, order: section.order, content: section.content, claimIds: section.claimIds, citationIds: section.citationIds, citationItemIds: section.citationIds, evidenceExcerptIds: section.evidenceExcerptIds, evidenceBundleId: section.evidenceBundleId, unsupportedStatements: section.unsupportedStatements, evidenceGaps: section.evidenceGaps, contentHash: contentHash(section.content) })), approvalStatus: "not_reviewed", createdBy: "hash", createdAt: "" });
}

export function documentForVersion(current: ProjectDocument, versionId: string): ProjectDocument | undefined {
  const version = listDocumentVersions(current.projectId, current.id).find((item) => item.id === versionId); if (!version) return undefined;
  const manuscript = version.manuscriptSnapshot ? structuredClone(version.manuscriptSnapshot) : structuredClone(current.manuscript); manuscript.title = version.title ?? manuscript.title; manuscript.updatedAt = version.createdAt; if (current.documentType === "journal-article") manuscript.targetJournal = version.targetVenue ?? manuscript.targetJournal; else manuscript.targetUniversity = version.targetVenue ?? manuscript.targetUniversity;
  const snapshotSections = new Map(version.sections.map((item) => [item.sectionId, item]));
  manuscript.chapters = manuscript.chapters.map((chapter) => ({ ...chapter, sections: chapter.sections.filter((section) => snapshotSections.has(section.id)).map((section) => { const saved = snapshotSections.get(section.id)!; return { ...section, title: saved.title, order: saved.order ?? section.order, content: saved.content, claimIds: saved.claimIds, citationIds: saved.citationIds ?? saved.citationItemIds ?? [], evidenceExcerptIds: saved.evidenceExcerptIds, evidenceBundleId: saved.evidenceBundleId, unsupportedStatements: Array.isArray(saved.unsupportedStatements) ? saved.unsupportedStatements.map((item) => typeof item === "string" ? { statement: item, reason: "restored from immutable document version" } : item) : [], evidenceGaps: Array.isArray(saved.evidenceGaps) ? saved.evidenceGaps.map((item) => typeof item === "string" ? item : item.description) : [] }; }) })).filter((chapter) => chapter.sections.length > 0);
  return { ...current, title: version.title ?? current.title, researchMode: (version.researchMode ?? current.researchMode) as ResearchMode, mode: (version.researchMode ?? current.mode) as ResearchMode, evidenceMode: (version.evidenceMode ?? current.evidenceMode) as EvidenceMode, targetVenue: version.targetVenue ?? current.targetVenue, currentVersionId: version.id, currentVersionNumber: version.versionNumber, manuscript, versionSnapshot: version };
}

function createDocumentSnapshot(projectId: string, document: ProjectDocument, createdBy: string): DocumentVersion {
  const db = portfolioDatabase();
  const current = db.prepare(`SELECT d.current_version_id AS currentVersionId,COALESCE(MAX(s.version_number),0) AS versionNumber
    FROM documents d LEFT JOIN document_snapshots s ON s.project_id=d.project_id AND s.document_id=d.id
    WHERE d.project_id=? AND d.id=? GROUP BY d.current_version_id`).get(projectId, document.id) as { versionNumber?: number; currentVersionId?: string } | undefined;
  const versionNumber = Number(current?.versionNumber ?? 0) + 1;
  const snapshot = buildDocumentVersion(projectId, document, { id: `document-version-${randomUUID()}`, versionNumber, parentVersionId: current?.currentVersionId, createdBy, createdAt: now() });
  db.prepare("INSERT INTO document_snapshots (id,project_id,document_id,version_number,parent_version_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?)").run(snapshot.id, projectId, document.id, snapshot.versionNumber, snapshot.parentVersionId ?? null, JSON.stringify(snapshot), snapshot.createdAt);
  db.prepare("UPDATE documents SET current_version_id=?,current_version_number=? WHERE project_id=? AND id=?").run(snapshot.id, snapshot.versionNumber, projectId, document.id);
  return snapshot;
}

export function saveProjectSection(input: { projectId: string; documentId: string; sectionId: string; content: string; changeSummary: string; editor: string; generatedBy?: string; citationIds?: string[]; claimIds?: string[]; evidenceExcerptIds?: string[]; evidenceBundleId?: string; unsupportedStatements?: Array<{ statement: string; reason: string }>; evidenceGaps?: string[]; expectedVersion?: number }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。");
  const manuscript = document.manuscript;
  const section = manuscript.chapters.flatMap((chapter) => chapter.sections).find((candidate) => candidate.id === input.sectionId);
  if (!section) throw new Error("章节不存在。");
  if (section.locked) throw new Error("该章节已锁定。");
  if (input.expectedVersion !== undefined && input.expectedVersion !== document.currentVersionNumber) throw new Error("文档版本已变化，请刷新后重试。");
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
  const db = portfolioDatabase();
  db.exec("BEGIN IMMEDIATE");
  try {
    const currentVersion = db.prepare("SELECT current_version_number AS versionNumber FROM documents WHERE project_id=? AND id=?").get(input.projectId, input.documentId) as { versionNumber: number } | undefined;
    if (input.expectedVersion !== undefined && Number(currentVersion?.versionNumber ?? 0) !== input.expectedVersion) throw new Error("文档版本已变化，请刷新后重试。");
    db.prepare("INSERT INTO document_versions VALUES (?,?,?,?,?,?)").run(version.id, input.documentId, section.id, version.versionNumber, JSON.stringify(version), timestamp);
    updateProjectDocumentContent(input.projectId, input.documentId, manuscript, document.documentType);
    const savedDocument = getProjectDocument(input.projectId, input.documentId)!;
    const globalVersion = createDocumentSnapshot(input.projectId, savedDocument, input.editor);
    db.exec("COMMIT");
    return { document: getProjectDocument(input.projectId, input.documentId)!, version, documentVersion: globalVersion };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function listProjectDocumentVersions(projectId: string, documentId: string, sectionId?: string) {
  if (!getProjectDocument(projectId, documentId)) throw new Error("文档不存在。");
  const rows = sectionId
    ? portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_versions WHERE document_id=? AND section_id=? ORDER BY version_number DESC").all(documentId, sectionId)
    : portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_versions WHERE document_id=? ORDER BY created_at DESC").all(documentId);
  return (rows as Array<{ payload: string }>).map((row) => z.object({}).passthrough().parse(parse(row.payload, {})) as DraftVersion);
}

export function listDocumentVersions(projectId: string, documentId: string): DocumentVersion[] {
  if (!getProjectDocument(projectId, documentId)) throw new Error("文档不存在。");
  return (portfolioDatabase().prepare("SELECT payload_json AS payload FROM document_snapshots WHERE project_id=? AND document_id=? ORDER BY version_number DESC").all(projectId, documentId) as Array<{ payload: string }>).map((row) => parse<DocumentVersion>(row.payload, {} as DocumentVersion));
}

export function getDocumentVersion(projectId: string, documentId: string, versionId: string) {
  return listDocumentVersions(projectId, documentId).find((version) => version.id === versionId);
}

export function formalExportSnapshot(projectId: string, documentId: string, versionId: string) {
  const version = getDocumentVersion(projectId, documentId, versionId); if (!version) throw new Error("DocumentVersion 不存在。");
  if (!version.workspaceSnapshot || !version.researchPlanSnapshot || !version.institutionProfileSnapshot) throw new Error("DocumentVersion 缺少冻结的正式导出输入。");
  return { version, workspace: structuredClone(version.workspaceSnapshot) as WorkspaceData, researchPlan: structuredClone(version.researchPlanSnapshot) as ResearchPlanState, institution: structuredClone(version.institutionProfileSnapshot) as InstitutionProfile, evidence: structuredClone(version.evidenceExcerptsSnapshot ?? []) as EvidenceExcerpt[], citationStyle: version.citationStyle ?? "APA 7" };
}

export function snapshotProjectDocumentsAfterCitationStyleChange(projectId: string, editor = "researcher") {
  return listProjectDocuments(projectId).map((document) => {
    const saved = saveProjectDocument(projectId, document.id, document.manuscript, {
      expectedVersion: document.currentVersionNumber,
      editor,
    });
    return getDocumentVersion(projectId, document.id, saved.currentVersionId!)!;
  });
}

export function updateProjectCitationStyleAtomically(input: { projectId: string; citationStyle: import("./types").CitationStyleName; editor: string; expectedProjectUpdatedAt?: string; projectPatch?: Parameters<typeof updateProject>[1] }) {
  const database = portfolioDatabase(); database.exec("BEGIN IMMEDIATE");
  try {
    const current = getProject(input.projectId); if (!current) throw new Error("项目不存在。");
    if (input.expectedProjectUpdatedAt && current.updatedAt !== input.expectedProjectUpdatedAt) throw new Error("项目已被其他用户更新，请刷新后重试。");
    if (current.citationStyle === input.citationStyle) { database.exec("COMMIT"); return { project: current, documentVersions: [] as DocumentVersion[] }; }
    const documents = listProjectDocuments(input.projectId);
    updateProject(input.projectId, { ...input.projectPatch, citationStyle: input.citationStyle }, { allowCitationStyleChange: true });
    const documentVersions = documents.map((document) => createDocumentSnapshot(input.projectId, document, input.editor));
    const project = getProject(input.projectId)!; database.exec("COMMIT"); return { project, documentVersions };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export function saveInstitutionProfileWithDocumentSnapshots(projectId: string, profileInput: unknown, editor = "researcher") {
  const profile = institutionProfileSchema.parse(profileInput); const database = portfolioDatabase(); database.exec("BEGIN IMMEDIATE");
  try {
    const current = readInstitutionProfile(projectId);
    if (JSON.stringify(current) === JSON.stringify(profile)) { database.exec("COMMIT"); return { profile: current, documentVersions: [] as DocumentVersion[] }; }
    const documents = listProjectDocuments(projectId); const saved = saveInstitutionProfile(profile, projectId);
    const documentVersions = documents.map((document) => createDocumentSnapshot(projectId, document, editor));
    database.exec("COMMIT"); return { profile: saved, documentVersions };
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export function refreshDocumentVersionEvidenceSnapshot(projectId: string, documentId: string, versionId: string) {
  const db = portfolioDatabase(); const version = getDocumentVersion(projectId, documentId, versionId); if (!version) throw new Error("DocumentVersion 不存在。");
  const bindings = db.prepare("SELECT id,project_id AS projectId,document_id AS documentId,document_version_id AS documentVersionId,section_id AS sectionId,sentence_id AS sentenceId,claim_id AS claimId,evidence_excerpt_id AS evidenceExcerptId,work_id AS workId,citation_item_id AS citationItemId,relation,created_at AS createdAt FROM claim_evidence_citation_bindings WHERE project_id=? AND document_id=? AND document_version_id=? ORDER BY created_at,id").all(projectId, documentId, versionId) as unknown as NonNullable<DocumentVersion["claimEvidenceCitationBindings"]>;
  version.claimEvidenceCitationBindings = bindings;
  const hydrated = hydrateCitationItemsFromBindings(version);
  hydrated.contentHash = documentVersionContentHash(hydrated);
  hydrated.evidenceBindingHash = documentVersionEvidenceBindingHash(hydrated);
  hydrated.proposalInputHash = documentVersionProposalInputHash(hydrated);
  db.prepare("UPDATE document_snapshots SET payload_json=? WHERE id=? AND project_id=? AND document_id=?").run(JSON.stringify(hydrated), versionId, projectId, documentId);
  db.prepare("DELETE FROM document_approvals WHERE project_id=? AND document_id=? AND document_version_id=?").run(projectId, documentId, versionId);
  return hydrated;
}

export function updateDocumentVersionCitationLocations(projectId: string, documentId: string, versionId: string, sentences: Array<{ sentenceId: string; citationItemIds?: string[] }>) {
  const db = portfolioDatabase(); const version = getDocumentVersion(projectId, documentId, versionId); if (!version) throw new Error("DocumentVersion 不存在。");
  for (const cluster of version.citationClusters ?? []) { const sentence = sentences.find((item) => cluster.items.some((citation) => item.citationItemIds?.includes(citation.id))); if (sentence) cluster.sentenceId = sentence.sentenceId; }
  version.contentHash = documentVersionContentHash(version);
  db.prepare("UPDATE document_snapshots SET payload_json=? WHERE id=? AND project_id=? AND document_id=?").run(JSON.stringify(version), versionId, projectId, documentId);
  db.prepare("DELETE FROM document_approvals WHERE project_id=? AND document_id=? AND document_version_id=?").run(projectId, documentId, versionId);
  return version;
}

export function stageProjectSectionVersion(input: { projectId: string; documentId: string; sectionId: string; content: string; editor: string; generatedBy?: string; citationIds: string[]; claimIds: string[]; evidenceExcerptIds: string[]; evidenceBundleId?: string; unsupportedStatements: Array<{ statement: string; reason: string }>; evidenceGaps: string[]; expectedVersion?: number; idempotencyKey: string }) {
  const existing = listDocumentVersions(input.projectId, input.documentId).find((item) => item.idempotencyKey === input.idempotencyKey); if (existing) { const current = getProjectDocument(input.projectId, input.documentId)!; return { document: documentForVersion(current, existing.id)!, documentVersion: existing, reused: true }; }
  const current = getProjectDocument(input.projectId, input.documentId); if (!current) throw new Error("文档不存在。"); const candidate = structuredClone(current); const section = candidate.manuscript.chapters.flatMap((chapter) => chapter.sections).find((item) => item.id === input.sectionId); if (!section) throw new Error("章节不存在。"); if (section.locked) throw new Error("该章节已锁定。");
  section.content = input.content; section.citationIds = input.citationIds; section.claimIds = input.claimIds; section.evidenceExcerptIds = input.evidenceExcerptIds; section.evidenceBundleId = input.evidenceBundleId; section.unsupportedStatements = input.unsupportedStatements; section.evidenceGaps = input.evidenceGaps; section.updatedAt = now(); section.generatedBy = input.generatedBy; section.generatedAt = input.generatedBy ? section.updatedAt : section.generatedAt; candidate.manuscript.updatedAt = section.updatedAt;
  if (candidate.mode === "prospective") assertProspectiveIntegrity(section);
  const db = portfolioDatabase(); db.exec("BEGIN IMMEDIATE");
  try {
    const row = db.prepare("SELECT current_version_id AS currentVersionId,current_version_number AS versionNumber FROM documents WHERE project_id=? AND id=?").get(input.projectId, input.documentId) as { currentVersionId?: string; versionNumber: number } | undefined;
    if (input.expectedVersion !== undefined && Number(row?.versionNumber ?? 0) !== input.expectedVersion) throw new Error("文档版本已变化，请刷新后重试。");
    const maximum = db.prepare("SELECT COALESCE(MAX(version_number),0) AS versionNumber FROM document_snapshots WHERE project_id=? AND document_id=?").get(input.projectId, input.documentId) as { versionNumber: number };
    const snapshot = buildDocumentVersion(input.projectId, candidate, { id: `document-version-${randomUUID()}`, versionNumber: Number(maximum.versionNumber) + 1, parentVersionId: row?.currentVersionId, createdBy: input.editor, createdAt: now(), lifecycleStatus: "pending_validation", idempotencyKey: input.idempotencyKey });
    db.prepare("INSERT INTO document_snapshots (id,project_id,document_id,version_number,parent_version_id,payload_json,created_at) VALUES (?,?,?,?,?,?,?)").run(snapshot.id, snapshot.projectId, snapshot.documentId, snapshot.versionNumber, snapshot.parentVersionId ?? null, JSON.stringify(snapshot), snapshot.createdAt); db.exec("COMMIT"); return { document: documentForVersion(current, snapshot.id)!, documentVersion: snapshot, reused: false };
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function activateDocumentVersion(projectId: string, documentId: string, versionId: string) {
  const db = portfolioDatabase(); db.exec("BEGIN IMMEDIATE");
  try {
    const current = getProjectDocument(projectId, documentId); const version = getDocumentVersion(projectId, documentId, versionId); if (!current || !version || version.lifecycleStatus !== "pending_validation") throw new Error("只有 pending_validation DocumentVersion 可以激活。");
    const row = db.prepare("SELECT current_version_id AS currentVersionId FROM documents WHERE project_id=? AND id=?").get(projectId, documentId) as { currentVersionId?: string } | undefined; if ((row?.currentVersionId ?? undefined) !== version.parentVersionId) throw new Error("当前版本已变化，pending version 不能覆盖新的正文。");
    const document = documentForVersion(current, versionId)!; version.lifecycleStatus = "reviewable"; db.prepare("UPDATE document_snapshots SET payload_json=? WHERE id=?").run(JSON.stringify(version), versionId);
    db.prepare("UPDATE documents SET mode=?,research_mode=?,evidence_mode=?,title=?,status=?,target_venue=?,content_json=?,current_version_id=?,current_version_number=?,updated_at=? WHERE project_id=? AND id=?").run(document.researchMode, document.researchMode, document.evidenceMode, document.title, document.status, document.targetVenue, JSON.stringify(document.manuscript), version.id, version.versionNumber, now(), projectId, documentId); db.exec("COMMIT"); return getProjectDocument(projectId, documentId)!;
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

export function quarantineDocumentVersion(projectId: string, documentId: string, versionId: string) {
  const version = getDocumentVersion(projectId, documentId, versionId); if (!version) throw new Error("DocumentVersion 不存在。"); version.lifecycleStatus = "quarantined"; portfolioDatabase().prepare("UPDATE document_snapshots SET payload_json=? WHERE id=? AND project_id=? AND document_id=?").run(JSON.stringify(version), versionId, projectId, documentId); return version;
}

export function restoreProjectDocumentVersion(projectId: string, documentId: string, versionId: string) {
  const snapshot = getDocumentVersion(projectId, documentId, versionId);
  if (snapshot) {
    const current = getProjectDocument(projectId, documentId); if (!current) throw new Error("文档不存在。"); const document = documentForVersion(current, versionId); if (!document) throw new Error("文档版本不存在。"); document.manuscript.updatedAt = now();
    const db = portfolioDatabase(); db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE documents SET mode=?,research_mode=?,evidence_mode=?,title=?,target_venue=?,updated_at=? WHERE project_id=? AND id=?").run(document.researchMode, document.researchMode, document.evidenceMode, document.title, document.targetVenue, document.manuscript.updatedAt, projectId, documentId);
      updateProjectDocumentContent(projectId, documentId, document.manuscript, document.documentType);
      const restored = getProjectDocument(projectId, documentId)!;
      const next = createDocumentSnapshot(projectId, restored, "researcher");
      db.exec("COMMIT");
      return { document: getProjectDocument(projectId, documentId)!, documentVersion: next };
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  }
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

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

export const documentTypes = [
  "research-evidence-pack",
  "confirmation-proposal",
  "ethics-preregistration-pack",
  "study-report",
  "journal-article",
  "doctoral-thesis",
] as const;
export type DocumentType = (typeof documentTypes)[number];
export type ResearchStatus = "planned" | "completed" | "verified";
export type ManuscriptStatus = "draft" | "evidence-checked" | "methods-checked" | "supervisor-reviewed" | "approved";

const sectionSchema = z.object({
  id: z.string().min(1).max(120),
  chapterId: z.string().min(1).max(120),
  number: z.string().min(1).max(40),
  title: z.string().min(1).max(300),
  order: z.number().int().min(0).max(1000),
  targetWords: z.number().int().min(0).max(100000),
  content: z.string().max(500000),
  citationIds: z.array(z.string().max(120)).max(500),
  claimIds: z.array(z.string().max(120)).max(500),
  dependencyIds: z.array(z.string().max(120)).max(500),
  researchStatus: z.enum(["planned", "completed", "verified"]),
  status: z.enum(["draft", "evidence-checked", "methods-checked", "supervisor-reviewed", "approved"]),
  generatedBy: z.string().max(200).optional(),
  generatedAt: z.string().max(80).optional(),
  promptTemplateVersion: z.string().max(80).optional(),
  humanEditStatus: z.enum(["ai-generated", "human-edited", "evidence-checked", "supervisor-approved"]).default("ai-generated"),
  locked: z.boolean(),
  updatedAt: z.string().max(80),
});

const chapterSchema = z.object({
  id: z.string().min(1).max(120),
  number: z.string().min(1).max(40),
  title: z.string().min(1).max(300),
  order: z.number().int().min(0).max(1000),
  targetWords: z.number().int().min(0).max(100000),
  status: z.enum(["planned", "completed", "verified"]),
  sections: z.array(sectionSchema).max(100),
});

const glossaryTermSchema = z.object({
  id: z.string().min(1).max(120),
  term: z.string().min(1).max(200),
  definition: z.string().max(2000),
  firstUseSectionId: z.string().max(120).optional(),
});

const appendixSchema = z.object({ id: z.string().min(1).max(120), number: z.string().max(40), title: z.string().max(300), content: z.string().max(200000), status: z.enum(["planned", "completed", "verified"]) });
const figureSchema = z.object({ id: z.string().min(1).max(120), number: z.string().max(40), caption: z.string().max(1000), source: z.string().max(1000), status: z.enum(["planned", "completed", "verified"]) });
const tableSchema = z.object({ id: z.string().min(1).max(120), number: z.string().max(40), caption: z.string().max(1000), source: z.string().max(1000), status: z.enum(["planned", "completed", "verified"]) });

export const manuscriptSchema = z.object({
  id: z.string().min(1).max(120),
  documentType: z.enum(documentTypes),
  language: z.literal("English"),
  title: z.string().min(1).max(1000),
  version: z.string().min(1).max(80),
  status: z.enum(["draft", "evidence-checked", "methods-checked", "supervisor-reviewed", "approved"]),
  targetUniversity: z.string().max(300),
  targetJournal: z.string().max(300),
  candidate: z.string().max(300),
  school: z.string().max(300),
  supervisors: z.array(z.string().max(300)).max(20),
  chapters: z.array(chapterSchema).max(100),
  glossaryTerms: z.array(glossaryTermSchema).max(300),
  figures: z.array(figureSchema).max(300),
  tables: z.array(tableSchema).max(300),
  appendices: z.array(appendixSchema).max(300),
  createdAt: z.string().max(80),
  updatedAt: z.string().max(80),
});

export const draftVersionSchema = z.object({
  id: z.string().min(1).max(120),
  manuscriptId: z.string().min(1).max(120),
  sectionId: z.string().min(1).max(120),
  versionNumber: z.number().int().min(1),
  content: z.string().max(500000),
  changeSummary: z.string().max(3000),
  editor: z.string().max(300),
  generatedBy: z.string().max(200).optional(),
  promptTemplateVersion: z.string().max(80).optional(),
  researchStatus: z.enum(["planned", "completed", "verified"]),
  manuscriptStatus: z.enum(["draft", "evidence-checked", "methods-checked", "supervisor-reviewed", "approved"]),
  createdAt: z.string().max(80),
});

export type Manuscript = z.infer<typeof manuscriptSchema>;
export type ManuscriptSection = Manuscript["chapters"][number]["sections"][number];
export type DraftVersion = z.infer<typeof draftVersionSchema>;

const chapterTitles = [
  "Introduction and Research Context",
  "Problem Statement and Significance",
  "Critical Literature Review",
  "Research Gap and Auditable Novelty Position",
  "Theoretical Framework and Conceptual Model",
  "Research Questions and Hypotheses",
  "Overall Research Programme",
  "Study 1 Methodology",
  "Study 2 Methodology",
  "Pre-study, Replication or External-validity Plan",
  "Measurement and Instrument Validation",
  "Sampling, Power and Analysis Plan",
  "Ethics, Privacy, AI Use and Data Management",
  "Feasibility, Resources, Risks and Contingencies",
  "Timeline and Milestones",
  "Expected Theoretical, Methodological and Practical Contributions",
  "Limitations and Scope Boundaries",
];

function makeSections(chapterId: string, chapterNumber: number, title: string): ManuscriptSection[] {
  return [{
    id: `${chapterId}-main`, chapterId, number: `${chapterNumber}.1`, title, order: 0, targetWords: chapterNumber === 8 || chapterNumber === 9 ? 1800 : 1000,
    content: "", citationIds: [], claimIds: [], dependencyIds: [], researchStatus: "planned", status: "draft",
    humanEditStatus: "ai-generated", locked: false, updatedAt: new Date().toISOString(),
  }];
}

export function defaultManuscript(title: string): Manuscript {
  const now = new Date().toISOString();
  const chapters = chapterTitles.map((chapterTitle, index) => {
    const id = `chapter-${String(index + 1).padStart(2, "0")}`;
    return { id, number: String(index + 1), title: chapterTitle, order: index, targetWords: index === 0 ? 1200 : 1600, status: "planned" as const, sections: makeSections(id, index + 1, chapterTitle) };
  });
  return {
    id: "confirmation-proposal-main", documentType: "confirmation-proposal", language: "English", title, version: "v0.1", status: "draft",
    targetUniversity: "Generic Australian university baseline", targetJournal: "", candidate: "", school: "", supervisors: [], chapters,
    glossaryTerms: [], figures: [{ id: "figure-conceptual-model", number: "Figure 1", caption: "Registered conceptual model.", source: "To be generated from project-scoped constructs and hypotheses.", status: "planned" }],
    tables: [{ id: "table-study-matrix", number: "Table 1", caption: "Study overview matrix.", source: "Generated from registered research plan.", status: "planned" }],
    appendices: [{ id: "appendix-materials", number: "Appendix A", title: "Research materials and reproducibility records", content: "", status: "planned" }], createdAt: now, updatedAt: now,
  };
}

function readVersions(): DraftVersion[] {
  const stored = readWorkspaceState<unknown>("manuscript_versions");
  const parsed = z.array(draftVersionSchema).safeParse(stored);
  return parsed.success ? parsed.data : [];
}

export function readManuscript(): Manuscript {
  const stored = readWorkspaceState<unknown>("manuscript");
  const parsed = manuscriptSchema.safeParse(stored);
  return parsed.success ? parsed.data : defaultManuscript("AI-Assisted Product Descriptions and Seller-Contact Intentions in C2C Second-Hand Marketplaces");
}

export function saveManuscript(input: Manuscript): Manuscript {
  const manuscript = manuscriptSchema.parse({ ...input, updatedAt: new Date().toISOString() });
  writeWorkspaceState("manuscript", manuscript);
  return manuscript;
}

export function saveSectionDraft(input: { manuscriptId: string; sectionId: string; content: string; changeSummary: string; editor: string; generatedBy?: string; promptTemplateVersion?: string; researchStatus?: ResearchStatus; manuscriptStatus?: ManuscriptStatus }): { manuscript: Manuscript; version: DraftVersion } {
  const manuscript = readManuscript();
  if (manuscript.id !== input.manuscriptId) throw new Error("Manuscript不存在。");
  let found: ManuscriptSection | undefined;
  for (const chapter of manuscript.chapters) {
    const section = chapter.sections.find((candidate) => candidate.id === input.sectionId);
    if (section) { found = section; break; }
  }
  if (!found) throw new Error("Section不存在。");
  if (found.locked) throw new Error("该章节已锁定，不能覆盖；请先恢复为草稿状态。");
  const versions = readVersions().filter((version) => version.sectionId === input.sectionId);
  const now = new Date().toISOString();
  const version: DraftVersion = {
    id: `draft-${randomUUID()}`, manuscriptId: manuscript.id, sectionId: input.sectionId, versionNumber: versions.length + 1,
    content: input.content, changeSummary: input.changeSummary, editor: input.editor, generatedBy: input.generatedBy,
    promptTemplateVersion: input.promptTemplateVersion, researchStatus: input.researchStatus ?? found.researchStatus,
    manuscriptStatus: input.manuscriptStatus ?? found.status, createdAt: now,
  };
  found.content = input.content; found.researchStatus = version.researchStatus; found.status = version.manuscriptStatus;
  found.generatedBy = input.generatedBy; found.generatedAt = input.generatedBy ? now : found.generatedAt; found.promptTemplateVersion = input.promptTemplateVersion;
  found.humanEditStatus = input.generatedBy ? "ai-generated" : "human-edited"; found.updatedAt = now;
  const chapter = manuscript.chapters.find((candidate) => candidate.id === found?.chapterId);
  if (chapter) { chapter.status = chapter.sections.every((section) => section.content.trim().length > 0 ? section.researchStatus !== "planned" : false) ? "completed" : "planned"; }
  manuscript.version = `v0.${Math.max(1, Math.max(...readVersions().map((item) => item.versionNumber), 0) + 1)}`;
  saveManuscript(manuscript);
  const nextVersions = [...readVersions().filter((item) => item.id !== version.id), version];
  writeWorkspaceState("manuscript_versions", nextVersions);
  return { manuscript, version };
}

export function listDraftVersions(sectionId?: string) {
  return readVersions().filter((version) => !sectionId || version.sectionId === sectionId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function restoreDraftVersion(versionId: string): Manuscript {
  const version = readVersions().find((candidate) => candidate.id === versionId);
  if (!version) throw new Error("DraftVersion不存在。");
  return saveSectionDraft({ manuscriptId: version.manuscriptId, sectionId: version.sectionId, content: version.content, changeSummary: `Restored from ${version.id}`, editor: "researcher" }).manuscript;
}

import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

const databaseSourceSchema = z.object({ id: z.string().min(1).max(120), name: z.string().min(1).max(200), platform: z.string().max(200), url: z.string().url().or(z.literal("")), accessDate: z.string().max(40), notes: z.string().max(2000) });
const searchRunSchema = z.object({ id: z.string().min(1).max(120), databaseSourceId: z.string().min(1).max(120), searchString: z.string().min(1).max(10000), fields: z.array(z.string().max(100)).max(30), runDate: z.string().max(40), filters: z.string().max(3000), rawResultCount: z.number().int().nonnegative(), deduplicatedCount: z.number().int().nonnegative(), titleAbstractScreened: z.number().int().nonnegative(), fullTextAssessed: z.number().int().nonnegative(), includedCount: z.number().int().nonnegative(), notes: z.string().max(3000) });
const screeningDecisionSchema = z.object({ id: z.string().min(1).max(120), searchRunId: z.string().min(1).max(120), recordId: z.string().min(1).max(200), stage: z.enum(["title-abstract", "full-text"]), decision: z.enum(["include", "exclude", "uncertain"]), exclusionReason: z.string().max(500), reviewer: z.string().max(200), reviewedAt: z.string().max(40) });

export const reviewWorkflowSchema = z.object({
  id: z.string().min(1).max(120),
  title: z.string().max(1000),
  researchQuestion: z.string().max(5000),
  databases: z.array(databaseSourceSchema).max(50),
  searchRuns: z.array(searchRunSchema).max(500),
  screeningDecisions: z.array(screeningDecisionSchema).max(5000),
  citationChases: z.array(z.object({ id: z.string().max(120), sourceId: z.string().max(120), direction: z.enum(["forward", "backward"]), date: z.string().max(40), notes: z.string().max(2000) })).max(500),
  themes: z.array(z.object({ id: z.string().max(120), name: z.string().max(300), theory: z.string().max(1000), methods: z.string().max(1000), findings: z.string().max(3000), limitations: z.string().max(3000), evidenceIds: z.array(z.string().max(120)).max(300) })).max(300),
  updatedAt: z.string().max(80),
});

export type ReviewWorkflow = z.infer<typeof reviewWorkflowSchema>;

function emptyReview(): ReviewWorkflow { return { id: "critical-review-protocol", title: "Project critical literature review", researchQuestion: "Which established theories, mechanisms and empirical contexts support or challenge the registered project research question?", databases: [{ id: "openalex-discovery", name: "OpenAlex discovery metadata", platform: "OpenAlex", url: "https://openalex.org", accessDate: "", notes: "Discovery only; not automatic inclusion." }], searchRuns: [], screeningDecisions: [], citationChases: [], themes: [], updatedAt: new Date().toISOString() }; }

export function readReviewWorkflow(projectId?: string): ReviewWorkflow { const parsed = reviewWorkflowSchema.safeParse(readWorkspaceState<unknown>("review_workflow", projectId)); if (parsed.success) return parsed.data; const initial = emptyReview(); writeWorkspaceState("review_workflow", initial, projectId); return initial; }
export function saveReviewWorkflow(input: ReviewWorkflow, projectId?: string) { const workflow = reviewWorkflowSchema.parse({ ...input, updatedAt: new Date().toISOString() }); writeWorkspaceState("review_workflow", workflow, projectId); return workflow; }

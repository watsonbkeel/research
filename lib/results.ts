import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

const resultEstimateSchema = z.object({
  id: z.string().min(1).max(100),
  hypothesisId: z.string().max(100).optional(),
  estimand: z.string().min(1).max(500),
  estimate: z.number().finite(),
  standardError: z.number().finite().nonnegative().nullable(),
  ciLower: z.number().finite().nullable(),
  ciUpper: z.number().finite().nullable(),
  pValue: z.number().finite().min(0).max(1).nullable(),
  effectSize: z.number().finite().nullable(),
  preregistered: z.boolean(),
  notes: z.string().max(2000),
});

export const analysisRunSchema = z.object({
  id: z.string().min(1).max(100),
  studyId: z.string().min(1).max(100),
  analysisPlanId: z.string().max(100).optional(),
  datasetVersionId: z.string().min(1).max(100),
  status: z.enum(["planned", "running", "completed", "failed"]),
  isRealData: z.boolean(),
  sampleN: z.number().int().nonnegative().nullable(),
  scriptPath: z.string().max(500),
  environment: z.string().max(1000),
  outputChecksum: z.string().max(200),
  ranAt: z.string().max(80),
  resultEstimates: z.array(resultEstimateSchema).max(500),
  robustnessChecks: z.array(z.string().max(500)).max(100),
  notes: z.string().max(4000),
});

export type AnalysisRun = z.infer<typeof analysisRunSchema>;

export function readAnalysisRuns(projectId?: string): AnalysisRun[] {
  const stored = readWorkspaceState<unknown>("analysis_runs", projectId);
  const parsed = z.array(analysisRunSchema).safeParse(stored);
  return parsed.success ? parsed.data : [];
}

export function saveAnalysisRun(input: AnalysisRun, projectId?: string): AnalysisRun[] {
  const run = analysisRunSchema.parse(input);
  const runs = readAnalysisRuns(projectId).filter((candidate) => candidate.id !== run.id);
  runs.push(run);
  writeWorkspaceState("analysis_runs", runs, projectId);
  return runs;
}

export function hasCompletedRealAnalysis(studyId?: string, projectId?: string) {
  return readAnalysisRuns(projectId).some((run) => run.status === "completed" && run.isRealData && (!studyId || run.studyId === studyId));
}

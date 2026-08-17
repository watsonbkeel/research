import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

/**
 * P0 research-plan storage is deliberately independent of the workspace seed.
 * The document is stored under one app_state key so it can be atomically
 * replaced and versioned without changing the existing workspace schema.
 */

const text = (maximum: number) => z.string().min(1).max(maximum);
const idList = z.array(z.string().min(1).max(120)).max(100);

const planNote = z.union([
  z.string().max(5000),
  z.array(z.unknown()).max(100),
  z.record(z.string(), z.unknown()),
]);

export const hypothesisSchema = z.object({
  id: text(120),
  number: text(40),
  englishWording: text(5000),
  chineseExplanation: text(5000),
  type: text(80),
  theoryIds: idList,
  constructIds: idList,
  studyIds: idList,
  direction: text(120),
  boundary: text(5000),
  evidenceIds: idList,
  evidenceClass: z.enum(["confirmatory", "exploratory"]),
  priority: z.enum(["primary", "secondary"]),
  falsification: text(5000),
  reviewStatus: z.enum(["draft", "needs_review", "approved", "needs_revision"]),
}).strict();

export const analysisPlanSchema = z.object({
  id: text(120),
  studyId: text(120),
  hypothesisIds: idList,
  estimand: text(5000),
  model: text(5000),
  formula: text(5000),
  analysisClass: z.enum(["primary", "secondary", "exploratory"]),
  dataStatus: z.enum(["planned", "collecting", "ready", "analyzed", "blocked"]),
  power: planNote,
  exclusions: planNote,
  missing: planNote,
  robustness: planNote,
}).strict();

export const researchPlanInputSchema = z.object({
  hypotheses: z.array(hypothesisSchema).max(500),
  analysisPlans: z.array(analysisPlanSchema).max(500),
}).strict();

export const researchPlanPatchSchema = z.object({
  hypotheses: z.array(hypothesisSchema).max(500).optional(),
  analysisPlans: z.array(analysisPlanSchema).max(500).optional(),
}).strict().refine((value) => value.hypotheses !== undefined || value.analysisPlans !== undefined, {
  message: "PATCH至少需要提供hypotheses或analysisPlans之一。",
});

export type Hypothesis = z.infer<typeof hypothesisSchema>;
export type AnalysisPlan = z.infer<typeof analysisPlanSchema>;
export type ResearchPlanInput = z.infer<typeof researchPlanInputSchema>;
export type ResearchPlanPatch = z.infer<typeof researchPlanPatchSchema>;

export interface ResearchPlanState extends ResearchPlanInput {
  schemaVersion: 1;
  updatedAt: string;
}

const stateKey = "research_plan";
function readState(projectId?: string): unknown {
  return readWorkspaceState<unknown>(stateKey, projectId);
}

function writeState(value: ResearchPlanState, projectId?: string) {
  writeWorkspaceState(stateKey, value, projectId);
}

function validateState(input: ResearchPlanInput): ResearchPlanInput {
  const parsed = researchPlanInputSchema.parse(input);
  const hypothesisIds = new Set<string>();
  const hypothesisNumbers = new Set<string>();
  for (const [index, hypothesis] of parsed.hypotheses.entries()) {
    if (hypothesisIds.has(hypothesis.id)) {
      throw new ResearchPlanValidationError(`hypotheses[${index}].id重复：${hypothesis.id}`);
    }
    if (hypothesisNumbers.has(hypothesis.number)) {
      throw new ResearchPlanValidationError(`hypotheses[${index}].number重复：${hypothesis.number}`);
    }
    hypothesisIds.add(hypothesis.id);
    hypothesisNumbers.add(hypothesis.number);
  }

  const analysisIds = new Set<string>();
  for (const [index, analysis] of parsed.analysisPlans.entries()) {
    if (analysisIds.has(analysis.id)) {
      throw new ResearchPlanValidationError(`analysisPlans[${index}].id重复：${analysis.id}`);
    }
    analysisIds.add(analysis.id);
    const missingHypothesis = analysis.hypothesisIds.find((id) => !hypothesisIds.has(id));
    if (missingHypothesis) {
      throw new ResearchPlanValidationError(`analysisPlans[${index}]引用了不存在的假设：${missingHypothesis}`);
    }
  }
  return parsed;
}

export class ResearchPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchPlanValidationError";
  }
}

function emptyState(): ResearchPlanState {
  return { schemaVersion: 1, hypotheses: [], analysisPlans: [], updatedAt: new Date().toISOString() };
}

export async function readResearchPlan(projectId?: string): Promise<ResearchPlanState> {
  const raw = readState(projectId);
  if (!raw) {
    const initial = emptyState();
    writeState(initial, projectId);
    return initial;
  }
  const candidate = raw && typeof raw === "object"
    ? { hypotheses: (raw as { hypotheses?: unknown }).hypotheses, analysisPlans: (raw as { analysisPlans?: unknown }).analysisPlans }
    : raw;
  const parsed = researchPlanInputSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ResearchPlanValidationError("已保存的研究计划不符合当前schema，未自动覆盖原数据。");
  }
  try {
    const valid = validateState(parsed.data);
    const rawState = raw as Partial<ResearchPlanState>;
    return {
      schemaVersion: 1,
      ...valid,
      updatedAt: typeof rawState.updatedAt === "string" ? rawState.updatedAt : new Date().toISOString(),
    };
  } catch {
    throw new ResearchPlanValidationError("已保存的研究计划包含重复ID或无效引用，未自动覆盖原数据。");
  }
}

export async function saveResearchPlan(input: ResearchPlanInput, projectId?: string): Promise<ResearchPlanState> {
  const valid = validateState(input);
  const next: ResearchPlanState = {
    schemaVersion: 1,
    ...valid,
    updatedAt: new Date().toISOString(),
  };
  writeState(next, projectId);
  return next;
}

export async function patchResearchPlan(patch: ResearchPlanPatch, projectId?: string): Promise<ResearchPlanState> {
  const parsedPatch = researchPlanPatchSchema.parse(patch);
  const current = await readResearchPlan(projectId);
  return saveResearchPlan({
    hypotheses: parsedPatch.hypotheses ?? current.hypotheses,
    analysisPlans: parsedPatch.analysisPlans ?? current.analysisPlans,
  }, projectId);
}

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import {
  patchResearchPlan,
  readResearchPlan,
  saveResearchPlan,
  type ResearchPlanInput,
} from "@/lib/research-plan";

let temporaryDirectory = "";

const hypothesis = {
  id: "h1",
  number: "H1",
  englishWording: "Accountable provenance transparency increases perceived product-information authenticity.",
  chineseExplanation: "可问责的来源透明度提高商品信息真实性知觉。",
  type: "causal",
  theoryIds: ["signaling"],
  constructIds: ["product_information_authenticity"],
  studyIds: ["E2"],
  direction: "positive",
  boundary: "The effect is expected to be stronger for a new seller.",
  evidenceIds: ["work-1"],
  evidenceClass: "confirmatory" as const,
  priority: "primary" as const,
  falsification: "The confidence interval for the treatment contrast includes the pre-specified equivalence bound.",
  reviewStatus: "draft" as const,
};

const analysisPlan = {
  id: "analysis-e2-h1",
  studyId: "E2",
  hypothesisIds: ["h1"],
  estimand: "Difference in seller-contact intention between accountable and basic provenance labels.",
  model: "Linear mixed-effects model with treatment, reputation, and their interaction; item random intercept.",
  formula: "contact_intention ~ provenance * reputation + (1 | stimulus)",
  analysisClass: "primary" as const,
  dataStatus: "planned" as const,
  power: { method: "Monte Carlo", targetPower: 0.8, alpha: 0.05, effectSize: "SESOI to be calibrated", sampleSize: null, notes: "Pre-register before recruitment." },
  exclusions: "Duplicate participants, no consent, technical failure, or no primary outcome; manipulation failures retained for ITT.",
  missing: { strategy: "No mean imputation", assumptions: "Report missingness and use a pre-registered model-based sensitivity analysis." },
  robustness: ["ordinal outcome model", "stimulus fixed-effects sensitivity", "complete-case sensitivity"],
};

const input: ResearchPlanInput = { hypotheses: [hypothesis], analysisPlans: [analysisPlan] };

describe("research plan persistence and validation", () => {
  beforeAll(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "research-plan-"));
    process.env.WORKBENCH_DATA_DIR = temporaryDirectory;
  });

  afterAll(() => {
    delete process.env.WORKBENCH_DATA_DIR;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("starts with an empty versioned document and persists a full PUT", async () => {
    const empty = await readResearchPlan();
    expect(empty.schemaVersion).toBe(1);
    expect(empty.hypotheses).toEqual([]);
    const saved = await saveResearchPlan(input);
    expect(saved.hypotheses[0].englishWording).toContain("authenticity");
    expect(saved.analysisPlans[0].hypothesisIds).toEqual(["h1"]);
    expect(saved.updatedAt).toBeTruthy();
  });

  it("merges a PATCH without dropping the other collection", async () => {
    const patched = await patchResearchPlan({ hypotheses: [{ ...hypothesis, reviewStatus: "approved" }] });
    expect(patched.hypotheses[0].reviewStatus).toBe("approved");
    expect(patched.analysisPlans).toHaveLength(1);
  });

  it("rejects duplicate hypothesis numbers and dangling analysis links", async () => {
    await expect(saveResearchPlan({ hypotheses: [hypothesis, { ...hypothesis, id: "h2" }], analysisPlans: [] })).rejects.toThrow("number重复");
    await expect(saveResearchPlan({ hypotheses: [hypothesis], analysisPlans: [{ ...analysisPlan, hypothesisIds: ["missing"] }] })).rejects.toThrow("不存在的假设");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hasCompletedRealAnalysis, readAnalysisRuns, saveAnalysisRun } from "@/lib/results";

let temporaryDirectory = "";

describe("structured AnalysisRun gate", () => {
  beforeAll(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "analysis-runs-"));
    process.env.WORKBENCH_DATA_DIR = temporaryDirectory;
  });

  afterAll(() => {
    delete process.env.WORKBENCH_DATA_DIR;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("keeps planned runs blocked and unlocks only completed real data", () => {
    saveAnalysisRun({ id: "planned-run", studyId: "experiment-1", datasetVersionId: "dataset-v0", status: "planned", isRealData: false, sampleN: null, scriptPath: "", environment: "", outputChecksum: "", ranAt: new Date().toISOString(), resultEstimates: [], robustnessChecks: [], notes: "" });
    expect(hasCompletedRealAnalysis()).toBe(false);
    saveAnalysisRun({ id: "real-run", studyId: "experiment-1", datasetVersionId: "dataset-v1", status: "completed", isRealData: true, sampleN: 120, scriptPath: "analysis/main.R", environment: "R 4.x", outputChecksum: "sha256:test", ranAt: new Date().toISOString(), resultEstimates: [{ id: "estimate-1", estimand: "ITT contrast", estimate: 0.24, standardError: 0.08, ciLower: 0.08, ciUpper: 0.4, pValue: 0.02, effectSize: 0.3, preregistered: true, notes: "" }], robustnessChecks: ["ordinal sensitivity"], notes: "" });
    expect(readAnalysisRuns()).toHaveLength(2);
    expect(hasCompletedRealAnalysis("experiment-1")).toBe(true);
  });
});

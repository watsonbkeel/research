import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readDatasetRegistry, saveDatasetRegistry } from "@/lib/datasets";

let temporaryDirectory = "";

describe("dataset registry persistence", () => {
  beforeAll(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "datasets-"));
    process.env.WORKBENCH_DATA_DIR = temporaryDirectory;
  });

  afterAll(() => {
    delete process.env.WORKBENCH_DATA_DIR;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("initializes and persists all P1 data objects", () => {
    expect(readDatasetRegistry().datasets).toHaveLength(0);
    const saved = saveDatasetRegistry({
      datasets: [{ id: "dataset-1", studyId: "experiment-1", name: "Pilot responses", description: "", source: "Qualtrics", collectionStart: "2026-01-01", collectionEnd: "2026-01-02", sampleFunnel: "120 invited; 100 complete", finalN: 100, dataAvailability: "private", ethicsStatus: "approved", notes: "" }],
      datasetVersions: [{ id: "dataset-1-v1", datasetId: "dataset-1", version: "v1", fileName: "responses.csv", storagePath: "data/responses.csv", checksum: "sha256:test", rowCount: 100, isRealData: true, createdAt: "2026-01-02T00:00:00.000Z", notes: "" }],
      variableDictionaries: [{ id: "dict-1", datasetVersionId: "dataset-1-v1", variables: [{ name: "condition", label: "Experimental condition", dataType: "categorical", role: "manipulation", coding: "0=base; 1=responsibility", missingValues: [""], constructId: "", notes: "" }], updatedAt: "", notes: "" }],
      reproducibilityChecks: [{ id: "check-1", datasetVersionId: "dataset-1-v1", analysisRunId: "run-1", status: "passed", scriptPath: "analysis/main.R", environment: "R 4.4", dependencies: "renv.lock", outputChecksum: "sha256:output", checkedAt: "2026-01-03T00:00:00.000Z", notes: "" }],
      updatedAt: "",
    });
    expect(readDatasetRegistry()).toEqual(saved);
    expect(saved.datasetVersions[0].checksum).toBe("sha256:test");
    expect(saved.variableDictionaries[0].variables[0].role).toBe("manipulation");
  });

  it("replaces the registry atomically and rejects invalid records", () => {
    const current = readDatasetRegistry();
    saveDatasetRegistry({ ...current, datasets: [] });
    expect(readDatasetRegistry().datasets).toHaveLength(0);
    expect(() => saveDatasetRegistry({ ...current, datasets: [{ ...current.datasets[0], finalN: -1 }] })).toThrow();
  });
});

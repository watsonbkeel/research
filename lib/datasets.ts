import { z } from "zod";
import { readWorkspaceState, writeWorkspaceState } from "./storage";

const availabilitySchema = z.enum(["planned", "private", "open"]);

export const datasetSchema = z.object({
  id: z.string().min(1).max(120),
  studyId: z.string().max(120),
  name: z.string().min(1).max(300),
  description: z.string().max(4000),
  source: z.string().max(1000),
  collectionStart: z.string().max(40),
  collectionEnd: z.string().max(40),
  sampleFunnel: z.string().max(4000),
  finalN: z.number().int().nonnegative().nullable(),
  dataAvailability: availabilitySchema,
  ethicsStatus: z.enum(["pending", "submitted", "approved", "not-required"]),
  notes: z.string().max(4000),
});

export const datasetVersionSchema = z.object({
  id: z.string().min(1).max(120),
  datasetId: z.string().min(1).max(120),
  version: z.string().min(1).max(80),
  fileName: z.string().max(500),
  storagePath: z.string().max(500),
  checksum: z.string().max(200),
  rowCount: z.number().int().nonnegative().nullable(),
  isRealData: z.boolean(),
  createdAt: z.string().max(80),
  notes: z.string().max(3000),
});

const variableSchema = z.object({
  name: z.string().min(1).max(200),
  label: z.string().max(500),
  dataType: z.enum(["string", "integer", "number", "boolean", "date", "ordinal", "categorical"]),
  role: z.enum(["id", "demographic", "manipulation", "outcome", "mediator", "moderator", "covariate", "other"]),
  coding: z.string().max(2000),
  missingValues: z.array(z.string().max(100)).max(100),
  constructId: z.string().max(120),
  notes: z.string().max(2000),
});

export const variableDictionarySchema = z.object({
  id: z.string().min(1).max(120),
  datasetVersionId: z.string().min(1).max(120),
  variables: z.array(variableSchema).max(2000),
  updatedAt: z.string().max(80),
  notes: z.string().max(3000),
});

export const reproducibilityCheckSchema = z.object({
  id: z.string().min(1).max(120),
  datasetVersionId: z.string().min(1).max(120),
  analysisRunId: z.string().max(120),
  status: z.enum(["planned", "running", "passed", "failed"]),
  scriptPath: z.string().max(500),
  environment: z.string().max(2000),
  dependencies: z.string().max(3000),
  outputChecksum: z.string().max(200),
  checkedAt: z.string().max(80),
  notes: z.string().max(4000),
});

export const datasetRegistrySchema = z.object({
  datasets: z.array(datasetSchema).max(500),
  datasetVersions: z.array(datasetVersionSchema).max(2000),
  variableDictionaries: z.array(variableDictionarySchema).max(2000),
  reproducibilityChecks: z.array(reproducibilityCheckSchema).max(2000),
  updatedAt: z.string().max(80),
});

export type DatasetRegistry = z.infer<typeof datasetRegistrySchema>;
export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetVersion = z.infer<typeof datasetVersionSchema>;
export type VariableDictionary = z.infer<typeof variableDictionarySchema>;
export type ReproducibilityCheck = z.infer<typeof reproducibilityCheckSchema>;

const emptyRegistry = (): DatasetRegistry => ({
  datasets: [],
  datasetVersions: [],
  variableDictionaries: [],
  reproducibilityChecks: [],
  updatedAt: new Date().toISOString(),
});

export function readDatasetRegistry(projectId?: string): DatasetRegistry {
  const parsed = datasetRegistrySchema.safeParse(readWorkspaceState<unknown>("dataset_registry", projectId));
  if (parsed.success) return parsed.data;
  const initial = emptyRegistry();
  writeWorkspaceState("dataset_registry", initial, projectId);
  return initial;
}

export function saveDatasetRegistry(input: DatasetRegistry, projectId?: string): DatasetRegistry {
  const registry = datasetRegistrySchema.parse({ ...input, updatedAt: new Date().toISOString() });
  writeWorkspaceState("dataset_registry", registry, projectId);
  return registry;
}

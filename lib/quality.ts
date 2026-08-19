import { readWorkspace } from "./storage";
import { validateClaims } from "./validation";
import { effectiveVerificationStatus, listEvidenceExcerpts } from "./evidence-excerpts";
import { readResearchPlan } from "./research-plan";
import { hasCompletedRealAnalysis, readAnalysisRuns } from "./results";
import { readInstitutionProfile } from "./institution";
import { readReviewWorkflow } from "./review-workflow";
import { readMaterialRegistry } from "./materials";
import { readDatasetRegistry } from "./datasets";
import { getDefaultProjectId, getProject, portfolioDatabase } from "./portfolio";
import { ensureProjectProposal, listProjectDocuments } from "./project-documents";
import { ensureEvidenceSchema } from "./evidence-store";
import { randomUUID } from "node:crypto";

export interface QualityReport {
  id?: string;
  projectId?: string;
  documentId?: string;
  documentVersionId?: string;
  contentHash?: string;
  generatedAt: string;
  errors: string[];
  warnings: string[];
  checks: Array<{ id: string; label: string; status: "pass" | "warning" | "error"; detail: string }>;
}

export function saveVersionedQualityReport(report: QualityReport & { projectId: string; documentId: string; documentVersionId: string; contentHash: string }) {
  ensureEvidenceSchema(); const stored = { ...report, id: report.id ?? `quality-${randomUUID()}` };
  portfolioDatabase().prepare("INSERT OR REPLACE INTO quality_reports (id,project_id,document_id,document_version_id,content_hash,payload_json,checked_at) VALUES (?,?,?,?,?,?,?)").run(stored.id, stored.projectId, stored.documentId, stored.documentVersionId, stored.contentHash, JSON.stringify(stored), stored.generatedAt);
  return stored;
}

export function qualityReportForVersion(projectId: string, documentId: string, documentVersionId: string): QualityReport | undefined {
  ensureEvidenceSchema();
  const row = portfolioDatabase().prepare("SELECT payload_json AS payload FROM quality_reports WHERE project_id=? AND document_id=? AND document_version_id=? ORDER BY checked_at DESC LIMIT 1").get(projectId, documentId, documentVersionId) as { payload?: string } | undefined;
  return row?.payload ? JSON.parse(row.payload) as QualityReport : undefined;
}

export async function buildVersionedQualityReport(projectId: string, documentId: string, documentVersionId: string) {
  const { getDocumentVersion } = await import("./project-documents"); const version = getDocumentVersion(projectId, documentId, documentVersionId); if (!version?.contentHash) throw new Error("DocumentVersion 不存在或缺少 contentHash。");
  const report = await buildQualityReport(projectId); return saveVersionedQualityReport({ ...report, projectId, documentId, documentVersionId, contentHash: version.contentHash });
}

export async function buildQualityReport(projectId = getDefaultProjectId()): Promise<QualityReport> {
  const project = getProject(projectId);
  if (!project) throw new Error("项目不存在。");
  const [workspace, evidenceExcerpts, researchPlan] = await Promise.all([
    readWorkspace(projectId),
    listEvidenceExcerpts({ projectId }),
    readResearchPlan(projectId),
  ]);
  ensureProjectProposal(projectId);
  const documents = listProjectDocuments(projectId);
  const institution = readInstitutionProfile(projectId);
  const reviewWorkflow = readReviewWorkflow(projectId);
  const materialRegistry = readMaterialRegistry(projectId);
  const datasetRegistry = readDatasetRegistry(projectId);
  const runs = readAnalysisRuns(projectId);
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: QualityReport["checks"] = [];
  const add = (id: string, label: string, status: "pass" | "warning" | "error", detail: string) => {
    checks.push({ id, label, status, detail });
    if (status === "error") errors.push(detail);
    if (status === "warning") warnings.push(detail);
  };

  const lockedNames = project.policy.lockedDesignStatements.map((statement) => statement.split(":")[0].trim()).filter(Boolean);
  const missingLockedDesign = lockedNames.filter((name) => !workspace.experiments.some((experiment) => experiment.name === name));
  add("project-design-policy", "Project-specific locked design", missingLockedDesign.length ? "error" : lockedNames.length ? "pass" : "warning", missingLockedDesign.length ? `Locked design entries are missing: ${missingLockedDesign.join(", ")}.` : lockedNames.length ? "Registered studies preserve the project-specific locked design policy." : "No project-specific design statement has been locked yet.");

  const claimValidation = validateClaims(workspace.claims, workspace.works);
  add("citation-integrity", "Registered citation integrity", claimValidation.some((issue) => issue.severity === "error") ? "error" : claimValidation.length ? "warning" : "pass", claimValidation.length ? `Citation validator reports ${claimValidation.length} issue(s).` : "No registered citation-integrity issues detected.");
  const factualClaimIds = new Set(workspace.claims.filter((claim) => claim.kind === "已发表事实").map((claim) => claim.id));
  const claimEvidenceIds = new Set(evidenceExcerpts.filter((excerpt) => excerpt.claimId && effectiveVerificationStatus(excerpt) === "human_verified").map((excerpt) => excerpt.claimId));
  const unsupportedClaims = Array.from(factualClaimIds).filter((claimId) => !claimEvidenceIds.has(claimId));
  add("claim-evidence", "Claim-level evidence coverage", unsupportedClaims.length ? "error" : "pass", unsupportedClaims.length ? `Published-fact claims without a human_verified EvidenceExcerpt: ${unsupportedClaims.join(", ")}.` : "Every published-fact claim has a human_verified evidence excerpt.");

  const brokenHypotheses = researchPlan.hypotheses.filter((hypothesis) => !hypothesis.englishWording || hypothesis.studyIds.length === 0 || hypothesis.constructIds.length === 0 || hypothesis.falsification.length === 0);
  add("hypothesis-traceability", "Hypothesis traceability", !researchPlan.hypotheses.length || brokenHypotheses.length ? "error" : "pass", !researchPlan.hypotheses.length ? "No structured hypotheses have been registered." : brokenHypotheses.length ? `${brokenHypotheses.length} hypothesis(es) lack wording, study, construct, or falsification condition.` : "Hypotheses link wording, studies, constructs and falsification conditions.");
  const brokenPlans = researchPlan.analysisPlans.filter((plan) => !plan.estimand || !plan.model || !plan.formula || plan.hypothesisIds.length === 0);
  add("analysis-plan", "Analysis plan completeness", !researchPlan.analysisPlans.length || brokenPlans.length ? "error" : "pass", !researchPlan.analysisPlans.length ? "No structured analysis plan has been registered." : brokenPlans.length ? `${brokenPlans.length} analysis plan(s) lack a hypothesis link, estimand, model, or formula.` : "Analysis plans have estimands, models and formulas.");

  const emptySections = documents.flatMap((document) => document.manuscript.chapters.flatMap((chapter) => chapter.sections)).filter((section) => !section.content.trim());
  add("manuscript-completion", "Project document section completion", emptySections.length ? "warning" : "pass", emptySections.length ? `${emptySections.length} project document section(s) are still empty.` : "All registered project document sections contain text.");
  add("institution-profile", "Target-university compliance", institution.verificationStatus === "verified" ? "pass" : "warning", institution.verificationStatus === "verified" ? "Target-university requirements are marked verified." : "Only the generic Australian baseline is active; no specific university compliance claim is allowed.");
  add("results-gate", "Results integrity gate", hasCompletedRealAnalysis(undefined, projectId) ? "pass" : "warning", hasCompletedRealAnalysis(undefined, projectId) ? "At least one completed real-data AnalysisRun is registered." : "No completed real-data AnalysisRun exists; empirical Results generation remains blocked and only prospective drafting is allowed.");
  add("analysis-runs", "Structured result provenance", runs.every((run) => run.resultEstimates.every((estimate) => Number.isFinite(estimate.estimate))) ? "pass" : "error", "Every stored result estimate must be numeric and originate from a structured AnalysisRun.");

  const invalidPrismaRuns = reviewWorkflow.searchRuns.filter((run) => run.deduplicatedCount > run.rawResultCount || run.titleAbstractScreened > run.deduplicatedCount || run.fullTextAssessed > run.titleAbstractScreened || run.includedCount > run.fullTextAssessed);
  add("review-protocol", "Systematic-review protocol", !reviewWorkflow.searchRuns.length ? "warning" : invalidPrismaRuns.length ? "error" : "pass", !reviewWorkflow.searchRuns.length ? "No SearchRun has been registered; the literature review is not yet reproducible." : invalidPrismaRuns.length ? `${invalidPrismaRuns.length} SearchRun record(s) have inconsistent PRISMA counts.` : "SearchRun records include reproducible query metadata and monotonic PRISMA counts.");

  const unverifiedInstruments = materialRegistry.instruments.filter((instrument) => instrument.permissionStatus !== "cleared" || instrument.validationStatus === "unverified");
  add("measurement-readiness", "Scale and instrument readiness", !materialRegistry.instruments.length ? "warning" : unverifiedInstruments.length ? "warning" : "pass", !materialRegistry.instruments.length ? "No instruments or scale items have been registered." : unverifiedInstruments.length ? `${unverifiedInstruments.length} instrument(s) still need permission clearance or validation review.` : "Registered instruments have cleared permission and validation status.");

  const versionIds = new Set(datasetRegistry.datasetVersions.map((version) => version.id));
  const dictionaryVersionIds = new Set(datasetRegistry.variableDictionaries.filter((dictionary) => dictionary.variables.length > 0).map((dictionary) => dictionary.datasetVersionId));
  const incompleteRealVersions = datasetRegistry.datasetVersions.filter((version) => version.isRealData && (!version.checksum || !dictionaryVersionIds.has(version.id)));
  const danglingRuns = runs.filter((run) => run.isRealData && !versionIds.has(run.datasetVersionId));
  add("dataset-readiness", "Dataset version and dictionary readiness", danglingRuns.length ? "error" : !datasetRegistry.datasetVersions.length || incompleteRealVersions.length ? "warning" : "pass", danglingRuns.length ? `${danglingRuns.length} real-data AnalysisRun record(s) reference an unregistered DatasetVersion.` : !datasetRegistry.datasetVersions.length ? "No DatasetVersion has been registered; real-data analysis provenance is incomplete." : incompleteRealVersions.length ? `${incompleteRealVersions.length} real DatasetVersion record(s) lack a checksum or non-empty variable dictionary.` : "Dataset versions, checksums and variable dictionaries are registered.");

  return { generatedAt: new Date().toISOString(), errors, warnings, checks };
}

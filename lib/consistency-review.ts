import { randomUUID } from "node:crypto";
import { getProjectDocument } from "./project-documents";
import { readWorkspace } from "./storage";
import { readResearchPlan } from "./research-plan";
import { saveConsistencyReview, latestConsistencyReview } from "./evidence-store";
import type { ConsistencyReviewReport } from "./types";

function presentNote(value: unknown) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value && typeof value === "object" && Object.keys(value).length > 0);
}

export async function runConsistencyReview(input: { projectId: string; documentId: string; versionId?: string }) {
  const document = getProjectDocument(input.projectId, input.documentId); if (!document) throw new Error("文档不存在。");
  const workspace = await readWorkspace(input.projectId); const plan = await readResearchPlan(input.projectId); const issues: ConsistencyReviewReport["issues"] = [];
  const reviewId = `consistency-${randomUUID()}`; const reviewVersionId = input.versionId ?? document.currentVersionId ?? document.manuscript.version; const startedAt = new Date().toISOString();
  saveConsistencyReview({ id: reviewId, projectId: input.projectId, documentId: input.documentId, versionId: reviewVersionId, status: "running", issues: [], humanApproval: "not_reviewed", checkedAt: startedAt, checkerVersion: "consistency-review-v2" });
  const sections = document.manuscript.chapters.flatMap((chapter) => chapter.sections); const find = (pattern: RegExp) => sections.find((section) => pattern.test(section.title));
  const rq = find(/research question|research questions/i); const theory = find(/theor/i); const method = find(/method|sampling|analysis/i); const result = find(/result|discussion/i);
  if (!workspace.experiments.length) issues.push({ severity: "blocker", sourceSectionId: method?.id, issue: "没有登记 Study，研究问题无法连接到实验或方法。", recommendation: "先登记研究设计和 Study。" });
  if (!plan.hypotheses.length) issues.push({ severity: "blocker", sourceSectionId: rq?.id, issue: "没有登记 Hypothesis。", recommendation: "建立假设并连接到 Study、构念和分析计划。" });
  const studyIds = new Set(workspace.experiments.map((study) => study.id)); const constructIds = new Set(workspace.constructs.map((construct) => construct.id)); const theoryIds = new Set(workspace.theories.map((item) => item.id)); const workIds = new Set(workspace.works.map((work) => work.id));
  for (const hypothesis of plan.hypotheses) {
    if (!hypothesis.studyIds.length) issues.push({ severity: "blocker", sourceSectionId: rq?.id, issue: `${hypothesis.number} 没有连接 Study。`, recommendation: "为假设选择对应 Study。" });
    if (!hypothesis.constructIds.length) issues.push({ severity: "warning", sourceSectionId: theory?.id, issue: `${hypothesis.number} 没有连接构念。`, recommendation: "补齐构念定义和测量来源。" });
    if (hypothesis.studyIds.some((id) => !studyIds.has(id))) issues.push({ severity: "blocker", sourceSectionId: rq?.id, issue: `${hypothesis.number} 引用了不存在的 Study。`, recommendation: "将假设连接到当前项目已登记的 Study。" });
    if (hypothesis.constructIds.some((id) => !constructIds.has(id))) issues.push({ severity: "blocker", sourceSectionId: theory?.id, issue: `${hypothesis.number} 引用了不存在的 Construct。`, recommendation: "补登记构念或修正构念 ID。" });
    if (hypothesis.theoryIds.some((id) => !theoryIds.has(id))) issues.push({ severity: "blocker", sourceSectionId: theory?.id, issue: `${hypothesis.number} 引用了不存在的 Theory。`, recommendation: "补登记理论或修正理论 ID。" });
  }
  for (const analysis of plan.analysisPlans) {
    if (!studyIds.has(analysis.studyId)) issues.push({ severity: "blocker", sourceSectionId: method?.id, issue: `分析计划 ${analysis.id} 引用了不存在的 Study。`, recommendation: "将分析计划绑定到当前项目 Study。" });
    if (!analysis.hypothesisIds.length) issues.push({ severity: "blocker", sourceSectionId: method?.id, issue: `分析计划 ${analysis.id} 没有关联假设。`, recommendation: "将 estimand 和模型绑定到假设。" });
    if (!analysis.estimand || !analysis.model) issues.push({ severity: "blocker", sourceSectionId: method?.id, issue: `分析计划 ${analysis.id} 缺少 estimand 或模型。`, recommendation: "登记主要估计目标和分析模型。" });
    if (!presentNote(analysis.power)) issues.push({ severity: "warning", sourceSectionId: method?.id, issue: `分析计划 ${analysis.id} 没有样本量或 power analysis 依据。`, recommendation: "补充功效分析、最小可检测效应或明确待完成的 power analysis。" });
  }
  for (const study of workspace.experiments) {
    if (!study.objective.trim() || !study.design.trim() || !study.primaryTest.trim()) issues.push({ severity: "blocker", sourceSectionId: method?.id, issue: `${study.name} 缺少 objective、design 或 primary test。`, recommendation: "补齐 Study Card 的研究目标、设计和主要检验。" });
  }
  if (result && document.mode === "prospective" && /\b(?:found|showed|confirmed|p\s*[<=>])\b/i.test(result.content)) issues.push({ severity: "blocker", sourceSectionId: result.id, issue: "预测模式的 Results/Discussion 使用了已完成结果语气。", recommendation: "改成预期方向或条件式解释，或登记真实 AnalysisRun 后切换模式。" });
  if (workspace.constructs.some((construct) => construct.sourceWorkIds.length === 0)) issues.push({ severity: "warning", sourceSectionId: theory?.id, issue: "存在没有来源的构念定义。", recommendation: "补充量表或理论来源的核验记录。" });
  if (workspace.constructs.some((construct) => construct.sourceWorkIds.some((id) => !workIds.has(id)))) issues.push({ severity: "blocker", sourceSectionId: theory?.id, issue: "构念引用了不存在的量表或理论来源 Work。", recommendation: "修正 sourceWorkIds 并运行书目核验。" });
  if (method && !method.content.trim()) issues.push({ severity: "blocker", sourceSectionId: method.id, issue: "方法章节为空，研究设计链条无法审查。", recommendation: "先写入方法、操作化和分析计划。" });
  const status: ConsistencyReviewReport["status"] = issues.some((item) => item.severity === "blocker") ? "blocked" : issues.length ? "passed_with_warnings" : "passed";
  const report: ConsistencyReviewReport = { id: reviewId, projectId: input.projectId, documentId: input.documentId, versionId: reviewVersionId, status, issues, humanApproval: "not_reviewed", checkedAt: new Date().toISOString(), checkerVersion: "consistency-review-v2" };
  return saveConsistencyReview(report);
}

export { latestConsistencyReview };

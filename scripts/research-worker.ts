import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "../lib/storage";
import { callOpenAICompatible, classifyProviderError, ProviderCallError, type ProviderErrorCategory } from "../lib/provider-client";
import { addArtifact, addCandidate, addJobEvent, addMessage, claimNextJob, createProposalGenerationJob, getResearchJob, heartbeatJob, listArtifacts, listCandidates, listMessages, recoverExpiredJobs, transitionJob, updateResearchJob, type ResearchJob } from "../lib/assistant";
import { searchAcademicMetadata } from "../lib/assistant-search";
import { addTopicCandidate, getDefaultProjectId, getProject, getTopicBatch, listTopicCandidates, updateTopicBatch, updateTopicCandidate } from "../lib/portfolio";
import { ensureProjectProposal, saveProjectSection } from "../lib/project-documents";
import { runCitationAudit } from "../lib/citation-audit";
import { runConsistencyReview } from "../lib/consistency-review";
import { getProjectSnapshot, listUnsupportedClaims } from "../lib/assistant-tools";
import { saveCandidateRecord, stableCandidateId } from "../lib/evidence-store";
import { verifyCandidateBibliography } from "../lib/bibliographic-verification";
import { searchLocalFullText } from "../lib/full-text";
import { createRevisionProposal } from "../lib/evidence-store";
import { readManuscript, saveSectionDraft } from "../lib/manuscript";
import { generateStructuredSection, proposeSectionRevision } from "../lib/generation-service";
import { createEvidenceExcerpt } from "../lib/evidence-excerpts";

export type WorkerOptions = { once?: boolean; pollMs?: number; leaseMs?: number; workerId?: string };
type JsonMap = Record<string, unknown>;
class JobControlError extends Error {
  readonly status: string;
  constructor(status: string) { super(`Job ${status}`); this.status = status; }
}

class ResearchStageTimeoutError extends Error {
  readonly category = "timeout" as const;
  constructor(timeoutMs: number) { super(`Research stage timed out after ${timeoutMs}ms`); }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const text = (value: unknown) => typeof value === "string" ? value : "";
const retryableProviderCategories = new Set<ProviderErrorCategory>(["network", "provider_unavailable", "timeout", "rate_limit"]);

function boundedEnvironmentNumber(name: string, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.floor(parsed))) : fallback;
}

function retryCategory(error: unknown): ProviderErrorCategory {
  if (error instanceof ProviderCallError || error instanceof ResearchStageTimeoutError) return error.category;
  return classifyProviderError(error);
}

function conversationContext(job: ResearchJob) {
  if (!job.conversationId) return job.prompt;
  const messages = listMessages(job.conversationId)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => `${message.role === "user" ? "RESEARCHER" : "ASSISTANT"}: ${message.content}`)
    .join("\n\n");
  if (!messages) return job.prompt;
  const firstUser = listMessages(job.conversationId).find((message) => message.role === "user");
  const firstUserText = firstUser ? `RESEARCHER: ${firstUser.content}` : "";
  const trailing = messages.slice(-58_000);
  return firstUserText && !trailing.startsWith(firstUserText) ? `${firstUserText}\n\n${trailing}` : trailing;
}

function candidateIdentity(candidate: { title: string; metadata?: Record<string, unknown> }) {
  const doi = text(candidate.metadata?.doi).toLowerCase().replace(/^https?:\/\/doi\.org\//, "");
  return doi ? `doi:${doi}` : `title:${candidate.title.toLowerCase().replace(/\W+/g, " ").trim()}`;
}

function parseJson(content: string): JsonMap {
  try { return JSON.parse(content) as JsonMap; } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]) as JsonMap; } catch { return {}; } }
    return {};
  }
}

function queryList(value: unknown, fallback: string) {
  if (!Array.isArray(value)) return [fallback];
  const queries = value.map(text).map((query) => query.trim()).filter((query) => query.length >= 3).slice(0, 5);
  return queries.length ? queries : [fallback];
}

function reportValue(value: unknown, depth = 0): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (depth > 3) return JSON.stringify(value);
  if (Array.isArray(value)) return value.map((item) => reportValue(item, depth + 1)).filter(Boolean).join("\n");
  if (typeof value === "object") {
    return Object.entries(value as JsonMap)
      .map(([key, item]) => {
        const rendered = reportValue(item, depth + 1);
        return rendered ? `${key}: ${rendered}` : "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(value);
}

function reportText(report: JsonMap, candidates: number) {
  const verdict = text(report.verdict) || "needs_revision";
  const verdictLabel: Record<string, string> = { promising: "promising（可行性较高）", needs_revision: "needs_revision（可行但需要修订）", not_feasible: "not_feasible（当前不建议推进）" };
  const sections = [
    `可行性结论：${verdictLabel[verdict] ?? verdict}`,
    `研究问题建议：${reportValue(report.researchQuestion) || "待进一步明确"}`,
    `理论基础：${reportValue(report.theoreticalBasis) || "待补充来源核验"}`,
    `研究缺口：${reportValue(report.researchGap) || "待从全文证据中核验"}`,
    `设计建议：${reportValue(report.designRecommendation) || "待形成 Study Card"}`,
    `风险与限制：${reportValue(report.risks) || "待评估"}`,
    `本次保存候选文献：${candidates} 条。候选记录尚未成为正式纳入证据。`,
  ];
  const questions = Array.isArray(report.followUpQuestions) ? report.followUpQuestions.map(text).filter(Boolean) : [];
  if (questions.length) sections.push(`需要你补充：\n${questions.map((question) => `- ${question}`).join("\n")}`);
  return sections.join("\n\n");
}

async function callStage(job: ResearchJob, taskType: "literature_search" | "chinese_research_design" | "english_academic_writing", prompt: string, signal: AbortSignal) {
  const settings = await readPrivateSettings();
  const profileId = typeof job.input.profileId === "string" ? job.input.profileId : undefined;
  try {
    const result = await callOpenAICompatible({ settings, taskType, explicitProfileId: profileId, prompt, systemPrompt: "You are a cautious doctoral research assistant. Never invent sources, results, sample sizes or completed research. Keep planned work explicitly planned.", temperature: 0.2, signal });
    await recordGenerationAttempts(taskType, result.attempts);
    updateResearchJob(job.id, { input: { profileId: result.profile.id, profileName: result.profile.name } });
    return result;
  } catch (error) {
    if (error instanceof ProviderCallError) await recordGenerationAttempts(taskType, error.attempts);
    throw error;
  }
}

function setProgress(job: ResearchJob, stage: string, progress: number, extra: JsonMap = {}) {
  updateResearchJob(job.id, { input: { stage, progress, ...extra } });
  addJobEvent(job.id, "progress", { stage, progress });
}

async function runHeartbeatAttempt(job: ResearchJob, owner: string, task: (signal: AbortSignal) => Promise<unknown>, leaseMs: number) {
  const controller = new AbortController();
  const stageTimeoutMs = Math.max(30_000, Number(process.env.RESEARCH_STAGE_TIMEOUT_MS) || 300_000);
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, stageTimeoutMs);
  const heartbeat = setInterval(() => { try { heartbeatJob(job.id, owner, leaseMs); } catch { controller.abort(); } }, Math.max(5000, Math.floor(leaseMs / 3)));
  const control = setInterval(() => { const latest = getResearchJob(job.id); if (!latest || latest.status !== "running") controller.abort(); }, 2000);
  try { return await task(controller.signal); } catch (error) { const latest = getResearchJob(job.id); if (controller.signal.aborted && latest && latest.status !== "running") throw new JobControlError(latest.status); if (timedOut) throw new ResearchStageTimeoutError(stageTimeoutMs); throw error; } finally { clearTimeout(timeout); clearInterval(heartbeat); clearInterval(control); }
}

async function waitForRetry(job: ResearchJob, owner: string, leaseMs: number, delayMs: number) {
  const retryAt = Date.now() + delayMs;
  while (Date.now() < retryAt) {
    const latest = getResearchJob(job.id);
    if (!latest || latest.status !== "running" || latest.leaseOwner !== owner) throw new JobControlError(latest?.status ?? "cancelled");
    heartbeatJob(job.id, owner, leaseMs);
    await sleep(Math.min(1000, Math.max(1, retryAt - Date.now())));
  }
}

async function runWithHeartbeat(job: ResearchJob, owner: string, task: (signal: AbortSignal) => Promise<unknown>, leaseMs: number) {
  const maxRetries = boundedEnvironmentNumber("RESEARCH_STAGE_MAX_RETRIES", 2, 0, 5);
  const retryBaseMs = boundedEnvironmentNumber("RESEARCH_RETRY_BASE_MS", 2000, 1, 60_000);
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await runHeartbeatAttempt(job, owner, task, leaseMs);
      if (attempt > 0) updateResearchJob(job.id, { input: { retryAttempt: undefined, retryMax: undefined, retryCategory: undefined, nextRetryAt: undefined } });
      return result;
    } catch (error) {
      if (error instanceof JobControlError) throw error;
      const category = retryCategory(error);
      if (!retryableProviderCategories.has(category) || attempt >= maxRetries) throw error;
      const delayMs = Math.min(retryBaseMs * (2 ** attempt), 30_000, Math.max(1, Math.floor(leaseMs / 3)));
      const nextRetryAt = new Date(Date.now() + delayMs).toISOString();
      updateResearchJob(job.id, { input: { retryAttempt: attempt + 1, retryMax: maxRetries, retryCategory: category, nextRetryAt } });
      addJobEvent(job.id, "stage-retry", { stage: getResearchJob(job.id)?.stage, attempt: attempt + 1, maxRetries, category, delayMs, nextRetryAt });
      await waitForRetry(job, owner, leaseMs, delayMs);
    }
  }
}

async function processIdeaAssessment(job: ResearchJob, owner: string, leaseMs: number) {
  const projectId = job.projectId ?? getDefaultProjectId();
  const workspace = await readWorkspace(projectId);
  const idea = conversationContext(job);
  const savedStage = text(job.input.stage);
  const autoGenerateProposal = job.input.autoGenerateProposal === true;
  const clarificationRound = Number(job.input.clarificationRound ?? 0) || 0;
  const revisionRound = Number(job.input.revisionRound ?? 0) || 0;
  let intakeJson: JsonMap = { queries: job.input.queries };
  if (!savedStage || savedStage === "idea-intake") {
    setProgress(job, "idea-intake", 5);
    const intake = await runWithHeartbeat(job, owner, (signal) => callStage(job, "literature_search", `Parse this Chinese doctoral research conversation and return JSON only: {"readyForAssessment": boolean, "queries": string[], "researchQuestion": string, "followUpQuestions": string[]}. Set readyForAssessment=false only when essential information is missing and a responsible feasibility assessment cannot yet be made; optional refinements must not block the search. Never repeat a question the researcher has already answered. ${autoGenerateProposal || clarificationRound > 0 ? "The researcher has authorized you to make defensible non-blocking decisions, so return readyForAssessment=true and proceed using clearly labelled working assumptions." : ""} Respect the registered project outcome interpretation: ${getProject(projectId)?.policy.outcomeInterpretation ?? "Do not describe planned outcomes as realised results."} Conversation:\n${idea}`, signal), leaseMs);
    intakeJson = parseJson((intake as { content: string }).content);
    const followUps = Array.isArray(intakeJson.followUpQuestions) ? intakeJson.followUpQuestions.map(text).filter(Boolean) : [];
    if (intakeJson.readyForAssessment === false && followUps.length && !autoGenerateProposal && clarificationRound === 0) { addMessage(job.conversationId ?? "", { role: "assistant", content: `为了判断这个想法是否可行，我需要先确认：\n${followUps.map((question) => `- ${question}`).join("\n")}`, metadata: { jobId: job.id, stage: "idea-intake" } }); transitionJob(job.id, "waiting-user"); return; }
  }

  const queries = queryList(intakeJson.queries, idea);
  let searchResults: { results: Array<{ candidates: unknown[]; failures: unknown[] }>; count: number } = { results: [], count: listCandidates(job.id).length };
  if (savedStage !== "feasibility") {
    setProgress(job, "literature-search", 25, { queries });
    searchResults = await runWithHeartbeat(job, owner, async (signal) => {
      const results = await Promise.all(queries.map((query) => searchAcademicMetadata(query, { perProvider: 12, signal })));
      if (signal.aborted) throw new Error("Academic metadata search was interrupted");
      const existingCandidates = listCandidates(job.id);
      const seen = new Set(existingCandidates.map(candidateIdentity));
      let count = existingCandidates.length;
      for (const result of results) {
        for (const candidate of result.candidates) {
          const identity = candidateIdentity({ title: candidate.title, metadata: candidate as unknown as JsonMap });
          if (seen.has(identity)) continue;
          addCandidate({ jobId: job.id, title: candidate.title, url: candidate.url, source: candidate.provider, abstract: candidate.abstract, metadata: candidate as unknown as JsonMap });
          seen.add(identity);
          count += 1;
        }
      }
      addArtifact({ jobId: job.id, type: "candidate-search", title: "Academic metadata discovery", content: results, metadata: { provenance: "metadata-discovery", queries } });
      return { results, count };
    }, leaseMs) as { results: Array<{ candidates: unknown[]; failures: unknown[] }>; count: number };
  }

  setProgress(job, "feasibility", 65);
  const candidateSummary = (searchResults.results.length ? searchResults.results.flatMap((result) => result.candidates) : listCandidates(job.id))
    .slice(0, 25)
    .map((candidate) => {
      const item = candidate as JsonMap;
      return JSON.stringify({
        title: text(item.title),
        authors: Array.isArray(item.authors) ? item.authors.slice(0, 4) : [],
        year: item.year,
        venue: text(item.venue),
        doi: text(item.doi),
        abstract: text(item.abstract)?.slice(0, 400),
      });
    })
    .join("\n");
  const reportResult = await runWithHeartbeat(job, owner, (signal) => callStage(job, "chinese_research_design", `Evaluate and converge this research idea for an Australian PhD Confirmation Proposal. Return JSON only with keys verdict (promising|needs_revision|not_feasible), researchQuestion, theoreticalBasis, researchGap, designRecommendation, risks, followUpQuestions. Do not repeat questions already answered. ${autoGenerateProposal || revisionRound > 0 ? "The researcher has authorized you to choose the highest-quality defensible option for any non-blocking ambiguity. Make those choices explicitly, use working assumptions where verification is still required, and do not return open questions unless proceeding would be academically irresponsible." : ""} Do not claim candidate metadata is verified evidence. Idea: ${idea}\nExisting project design: ${workspace.project.titleEn}\nCandidate metadata:\n${candidateSummary.slice(0, 30000)}`, signal), leaseMs);
  const report = parseJson((reportResult as { content: string }).content);
  if (!["promising", "needs_revision", "not_feasible"].includes(text(report.verdict))) throw new Error("The model did not return a valid feasibility assessment. Retry the task or choose another model.");
  addArtifact({ jobId: job.id, type: "feasibility-report", title: "Feasibility assessment", content: report, metadata: { candidateCount: searchResults.count, model: (reportResult as { profile: { model: string } }).profile.model } });
  const feasibilityMessage = reportText(report, searchResults.count);
  addMessage(job.conversationId ?? "", {
    role: "assistant",
    content: revisionRound > 0 && !autoGenerateProposal
      ? `${feasibilityMessage}\n\n本轮已完成方案收敛，不再重复追问；剩余事项将作为待核验项或工作假设处理。`
      : feasibilityMessage,
    metadata: { jobId: job.id, artifactType: "feasibility-report" },
  });
  const verdict = text(report.verdict);
  setProgress(job, "feasibility", 100);
  if (autoGenerateProposal) {
    createProposalGenerationJob(job.id, job.prompt);
    addMessage(job.conversationId ?? "", { role: "assistant", content: "已按你的明确要求完成研究方案收敛，英文 Confirmation Proposal 已进入后台生成队列。未核验文献、平台许可和样本量将作为待核验项或工作假设标注，不再因非阻断性问题暂停。", metadata: { jobId: job.id, stage: "proposal-outline" } });
    transitionJob(job.id, "completed");
    return;
  }
  if (verdict === "promising" || revisionRound > 0) {
    if (verdict !== "promising") addMessage(job.conversationId ?? "", { role: "assistant", content: "我已依据你的补充完成方案收敛。剩余问题将作为开题报告中的待核验项或工作假设处理，不再重复追问；你可以按当前方案生成 Proposal。", metadata: { jobId: job.id, stage: "feasibility" } });
    transitionJob(job.id, "waiting-confirmation");
    return;
  }
  transitionJob(job.id, "waiting-user");
}

async function processTopicBatch(job: ResearchJob, owner: string, leaseMs: number) {
  const batchId = text(job.input.topicBatchId);
  const batch = getTopicBatch(batchId);
  if (!batch) throw new Error("Topic batch not found");
  updateTopicBatch(batch.id, { status: "running" });
  let candidates = listTopicCandidates(batch.id);
  if (batch.inputMode === "expand" && candidates.length < batch.requestedCount) {
    setProgress(job, "topic-expansion", 8);
    const result = await runWithHeartbeat(job, owner, (signal) => callStage(job, "chinese_research_design", `Generate ${batch.requestedCount} distinct, defensible doctoral research topics from the following broad research brief. Return JSON only as {"candidates":[{"title":"Chinese title","description":"specific research question and context","searchQuery":"English academic search query"}]}. Each topic must be empirically testable, theoretically meaningful, ethically plausible and sufficiently distinct for comparison. Do not claim novelty or cite sources. Brief:\n${batch.brief}`, signal), leaseMs);
    const parsed = parseJson((result as { content: string }).content);
    const generated = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    for (const item of generated.slice(0, batch.requestedCount)) {
      if (!item || typeof item !== "object") continue;
      const value = item as JsonMap;
      const title = text(value.title).trim();
      if (title.length < 3 || candidates.some((candidate) => candidate.title.toLowerCase() === title.toLowerCase())) continue;
      addTopicCandidate(batch.id, { title, description: text(value.description), status: "pending", report: { searchQuery: text(value.searchQuery) } });
    }
    candidates = listTopicCandidates(batch.id);
  }
  if (candidates.length < 2) throw new Error("The topic batch did not produce enough candidates for comparison.");
  const scoreKeys = ["significance", "noveltyEvidence", "theoreticalCoherence", "testability", "feasibility", "publicationPotential"];
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate.status === "evaluated" || candidate.status === "promoted") continue;
    setProgress(job, "topic-evaluation", Math.round(15 + (index / Math.max(1, candidates.length)) * 78), { candidateId: candidate.id });
    try {
      const query = text(candidate.report.searchQuery) || candidate.title;
      const search = await runWithHeartbeat(job, owner, (signal) => searchAcademicMetadata(query, { perProvider: 8, signal }), leaseMs) as Awaited<ReturnType<typeof searchAcademicMetadata>>;
      const metadata = search.candidates.slice(0, 18).map((item) => ({ title: item.title, year: item.year, venue: item.venue, doi: item.doi, abstract: item.abstract?.slice(0, 500) }));
      const assessment = await runWithHeartbeat(job, owner, (signal) => callStage(job, "chinese_research_design", `Assess one candidate doctoral topic conservatively. Candidate metadata is discovery-only and is not verified evidence. Return JSON only with keys titleEn, titleZh, field, context, primaryOutcome, secondaryOutcome, researchQuestion, theoreticalBasis, evidenceGap, designRecommendation, paperPortfolioPotential, scores, risks, ethicsGate, recommendation, confidence. scores must contain integers 1-5 for significance, noveltyEvidence, theoreticalCoherence, testability, feasibility, publicationPotential. ethicsGate must be pass, warn or block. Do not make an absolute novelty claim. Candidate: ${candidate.title}\nDescription: ${candidate.description}\nAcademic metadata:\n${JSON.stringify(metadata).slice(0, 26000)}`, signal), leaseMs);
      const report = parseJson((assessment as { content: string }).content);
      const rawScores = report.scores && typeof report.scores === "object" ? report.scores as JsonMap : {};
      const scores = Object.fromEntries(scoreKeys.map((key) => [key, Math.max(1, Math.min(5, Math.round(Number(rawScores[key]) || 1)))]));
      scores.overall = Number((scores.significance * 0.2 + scores.noveltyEvidence * 0.2 + scores.theoreticalCoherence * 0.15 + scores.testability * 0.2 + scores.feasibility * 0.15 + scores.publicationPotential * 0.1).toFixed(2));
      const risks = Array.isArray(report.risks) ? report.risks.map(text).filter(Boolean).slice(0, 20) : [];
      updateTopicCandidate(candidate.id, { status: "evaluated", scores, risks, report: { ...report, metadataCount: metadata.length, metadataProvenance: "discovery-only" } });
      addArtifact({ jobId: job.id, type: "topic-candidate-assessment", title: candidate.title, content: report, metadata: { topicBatchId: batch.id, topicCandidateId: candidate.id, metadataCount: metadata.length } });
    } catch (error) {
      updateTopicCandidate(candidate.id, { status: "failed", risks: [error instanceof Error ? error.message : "候选评估失败"] });
    }
  }
  const completed = listTopicCandidates(batch.id);
  if (!completed.some((candidate) => candidate.status === "evaluated" || candidate.status === "promoted")) throw new Error("All topic candidate assessments failed.");
  updateTopicBatch(batch.id, { status: completed.some((candidate) => candidate.status === "failed") ? "completed-with-errors" : "completed" });
  setProgress(job, "topic-comparison", 100);
  addArtifact({ jobId: job.id, type: "topic-comparison", title: "Candidate topic comparison", content: completed, metadata: { topicBatchId: batch.id, metadataIsNotVerifiedEvidence: true } });
  transitionJob(job.id, "completed");
}

async function processProposal(job: ResearchJob, owner: string, leaseMs: number) {
  const projectId = job.projectId;
  const project = projectId ? getProject(projectId) : undefined;
  if (projectId && !project) throw new Error("Project not found");
  const projectDocument = projectId ? ensureProjectProposal(projectId) : undefined;
  const manuscript = projectDocument?.manuscript ?? readManuscript();
  const researchConversation = conversationContext(job).slice(-30_000);
  const feasibilityJobId = text(job.input.feasibilityJobId);
  const feasibilityReport = feasibilityJobId
    ? listArtifacts(feasibilityJobId).find((artifact) => artifact.type === "feasibility-report")?.content
    : undefined;
  const proposalBrief = JSON.stringify(feasibilityReport ?? {}).slice(0, 20_000);
  const completedSections = new Set(Array.isArray(job.input.completedSections) ? job.input.completedSections.map(text) : []);
  const sections = manuscript.chapters.flatMap((chapter) => chapter.sections);
  if (projectId && projectDocument) {
    for (let index = 0; index < sections.length; index += 1) {
      const section = sections[index];
      if (completedSections.has(section.id)) continue;
      const latest = getResearchJob(job.id);
      if (!latest || latest.status !== "running") throw new JobControlError(latest?.status ?? "cancelled");
      setProgress(job, "proposal-structured-draft", Math.round(10 + ((index / Math.max(1, sections.length)) * 85)), { completedSections: [...completedSections] });
      const generated = await runWithHeartbeat(job, owner, (signal) => generateStructuredSection({ projectId, documentId: projectDocument.id, sectionId: section.id, profileId: text(job.input.profileId) || undefined, editor: "researcher", signal }), leaseMs) as Awaited<ReturnType<typeof generateStructuredSection>>;
      addArtifact({ jobId: job.id, type: "draft-version", title: section.title, content: { sectionId: section.id, draftVersionId: generated.version.id, evidenceBundleId: generated.version.evidenceBundleId, citationIds: generated.version.citationIds, evidenceExcerptIds: generated.version.evidenceExcerptIds }, metadata: { stage: "proposal-structured-draft", auditId: generated.audit.id } });
      completedSections.add(section.id);
      updateResearchJob(job.id, { input: { completedSections: [...completedSections] } });
    }
    const consistency = await runConsistencyReview({ projectId, documentId: projectDocument.id, versionId: projectDocument.manuscript.version });
    addArtifact({ jobId: job.id, type: "consistency-review", title: "一致性审查报告", content: consistency, metadata: { stage: "consistency-review", automatic: true } });
    setProgress(job, "consistency-review", 100, { completedSections: [...completedSections], reviewId: consistency.id, reviewStatus: consistency.status });
    addMessage(job.conversationId ?? "", { role: "assistant", content: `Proposal 已通过统一的结构化证据服务按章节保存 DraftVersion，并完成一致性审查（${consistency.status}）。每章的 citation、EvidenceExcerpt 和 CitationAudit 已记录；自动审查不等于人工批准。`, metadata: { jobId: job.id, stage: "consistency-review", reviewId: consistency.id } });
    transitionJob(job.id, "completed");
    return;
  }
  const evidence = (await (await import("../lib/evidence-excerpts")).listEvidenceExcerpts(projectId ? { projectId } : {})).filter((excerpt) => excerpt.verificationStatus === "claim_verified" && excerpt.externalModelUsePermission === "allowed");
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    if (completedSections.has(section.id)) continue;
    const latest = getResearchJob(job.id);
    if (!latest || latest.status !== "running") throw new JobControlError(latest?.status ?? "cancelled");
    const progress = Math.round(10 + ((index / Math.max(1, sections.length)) * 85));
    setProgress(job, "proposal-draft", progress, { completedSections: [...completedSections] });
    const policy = project?.policy ?? { outcomeInterpretation: "Planned outcomes must not be presented as realised results.", forbiddenClaims: ["invented evidence", "invented sample sizes", "invented results"] };
    const result = await runWithHeartbeat(job, owner, (signal) => callStage(job, "english_academic_writing", `Write the following English section for an Australian doctoral Confirmation Proposal. Section: ${section.number} ${section.title}. Target words: ${section.targetWords}. Current manuscript title: ${manuscript.title}. Produce finished proposal prose, not questions, instructions, a checklist, or advice to the researcher. Resolve non-blocking missing choices with the most defensible recommendation in the feasibility report and label unverified dependencies as planned verification or working assumptions. Maintain explicit alignment among the research gap, theory, research questions, hypotheses, constructs, studies, estimands and contribution. The research conversation and feasibility report below define the proposed direction, but neither is verified evidence. Use future-oriented language for planned studies. Do not invent evidence, results, sample sizes or citations. Project integrity policy: ${policy.outcomeInterpretation}; forbidden claims: ${policy.forbiddenClaims.join("; ")}.\n\nResearch conversation:\n${researchConversation}\n\nFeasibility report:\n${proposalBrief}\n\nVerified evidence excerpts allowed:\n${evidence.map((excerpt) => `[${excerpt.id}] ${excerpt.paraphrase ?? excerpt.quote ?? ""}`).join("\n") || "None; write only planned design content and clearly mark evidence gaps."}`, signal), leaseMs);
    const generatedBy = `${(result as { profile: { provider: string; model: string } }).profile.provider}/${(result as { profile: { model: string } }).profile.model}`;
    const saved = projectId && projectDocument
      ? saveProjectSection({ projectId, documentId: projectDocument.id, sectionId: section.id, content: (result as { content: string }).content.trim(), changeSummary: "AI assistant proposal draft; human review required", editor: "researcher", generatedBy })
      : saveSectionDraft({ manuscriptId: manuscript.id, sectionId: section.id, content: (result as { content: string }).content.trim(), changeSummary: "AI assistant proposal draft; human review required", editor: "researcher", generatedBy, promptTemplateVersion: "assistant-proposal-v1", researchStatus: section.researchStatus, manuscriptStatus: "draft" });
    addArtifact({ jobId: job.id, type: "draft-version", title: section.title, content: { sectionId: section.id, draftVersionId: saved.version.id }, metadata: { stage: "proposal-draft" } });
    completedSections.add(section.id);
    updateResearchJob(job.id, { input: { completedSections: [...completedSections] } });
  }
  setProgress(job, "proposal-draft", 100, { completedSections: [...completedSections] });
  addMessage(job.conversationId ?? "", { role: "assistant", content: "Proposal 英文草稿已按章节保存到稿件中心的 DraftVersion。请在稿件中心逐章审核证据、方法和语言状态。", metadata: { jobId: job.id, stage: "proposal-draft" } });
  transitionJob(job.id, "completed");
}

async function processAssistantTask(job: ResearchJob, owner: string, leaseMs: number) {
  const projectId = job.projectId; if (!projectId) throw new Error("助手任务必须绑定 projectId。"); const intent = String((job.input.assistantPlan as { intent?: string } | undefined)?.intent ?? job.kind.replace(/^assistant-/, ""));
  setProgress(job, "tool-dispatch", 10, { intent, actions: [intent] });
  if (intent === "idea_assessment") { await processIdeaAssessment(job, owner, leaseMs); return; }
  if (intent === "proposal_generation") { await processProposal(job, owner, leaseMs); return; }
  if (intent === "section_draft") {
    const documentId = String(job.documentId ?? job.input.documentId ?? "");
    const sectionId = String(job.input.sectionId ?? "");
    const generated = await runWithHeartbeat(job, owner, (signal) => generateStructuredSection({ projectId, documentId, sectionId, profileId: text(job.input.profileId) || undefined, editor: "researcher", signal }), leaseMs) as Awaited<ReturnType<typeof generateStructuredSection>>;
    addArtifact({ jobId: job.id, type: "draft-version", title: "结构化章节草稿", content: { sectionId, draftVersionId: generated.version.id, evidenceBundleId: generated.version.evidenceBundleId, citationIds: generated.version.citationIds, evidenceExcerptIds: generated.version.evidenceExcerptIds }, metadata: { intent, auditId: generated.audit.id } });
    addMessage(job.conversationId ?? "", { role: "assistant", content: `章节草稿已保存为 DraftVersion；引用审查状态：${generated.audit.status}。`, metadata: { jobId: job.id, intent, auditId: generated.audit.id } });
    transitionJob(job.id, "completed"); return;
  }
  if (intent === "bibliographic_verification" && typeof job.input.candidateId !== "string") {
    const { listCandidateRecords } = await import("../lib/evidence-store");
    const candidates = listCandidateRecords(projectId).filter((candidate) => candidate.status === "discovered");
    addArtifact({ jobId: job.id, type: "verification-selection", title: "待选择的候选文献", content: candidates, metadata: { intent, readOnly: true } });
    addMessage(job.conversationId ?? "", { role: "assistant", content: candidates.length ? `找到 ${candidates.length} 条未核验候选文献，请先指定 CandidateRecord ID；系统不会按 DOI 自动升级。` : "当前项目没有可核验的候选文献，请先执行文献检索。", metadata: { jobId: job.id, intent, readOnly: true } });
    transitionJob(job.id, "completed"); return;
  }
  if (intent === "topic_comparison") {
    const batch = job.topicBatchId ? getTopicBatch(job.topicBatchId) : undefined;
    const candidates = job.topicBatchId ? listTopicCandidates(job.topicBatchId) : [];
    addArtifact({ jobId: job.id, type: "topic-comparison", title: "选题比较上下文", content: candidates, metadata: { intent, topicBatchId: batch?.id, readOnly: true } });
    addMessage(job.conversationId ?? "", { role: "assistant", content: batch ? `当前选题批次包含 ${candidates.length} 个候选；候选评估不会把元数据当成已核验证据。` : "当前对话尚未绑定选题批次，请先创建或选择一个选题比较批次。", metadata: { jobId: job.id, intent, readOnly: true } });
    transitionJob(job.id, "completed"); return;
  }
  if (intent === "export") {
    const documentId = String(job.documentId ?? job.input.documentId ?? "");
    const audit = await runCitationAudit({ projectId, documentId, formal: true });
    addArtifact({ jobId: job.id, type: "export-readiness", title: "项目导出检查", content: audit, metadata: { intent, formalExportBlocked: audit.blockers.length > 0 } });
    addMessage(job.conversationId ?? "", { role: "assistant", content: audit.blockers.length ? `正式导出被阻断：${audit.blockers.length} 个 blocker。请先处理审查结果。` : `正式导出检查通过；请使用项目文档导出入口生成文件（${documentId}）。`, metadata: { jobId: job.id, intent, auditId: audit.id } });
    transitionJob(job.id, "completed"); return;
  }
  if (intent === "job_control") { addMessage(job.conversationId ?? "", { role: "assistant", content: "任务控制需要通过暂停、继续、取消或重试按钮执行；当前消息未修改任何任务状态。", metadata: { jobId: job.id, intent, readOnly: true } }); transitionJob(job.id, "completed"); return; }
  if (intent === "qa") { const snapshot = await getProjectSnapshot(projectId); addArtifact({ jobId: job.id, type: "project-snapshot", title: "当前项目快照", content: snapshot, metadata: { intent, readOnly: true } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `当前项目：${snapshot.project.titleEn}。Work ${snapshot.workspace.works} 条，human_verified 证据 ${snapshot.evidence.humanVerified} 条。`, metadata: { jobId: job.id, intent, readOnly: true } }); transitionJob(job.id, "completed"); return; }
  if (intent === "citation_audit") { const documentId = String(job.documentId ?? job.input.documentId ?? ""); const report = await runCitationAudit({ projectId, documentId, formal: true }); addArtifact({ jobId: job.id, type: "citation-audit", title: "引用审查报告", content: report, metadata: { intent } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `引用审查完成：${report.status}，blocker ${report.blockers.length}，warning ${report.warnings.length}。`, metadata: { jobId: job.id, intent, reportId: report.id } }); transitionJob(job.id, "completed"); return; }
  if (intent === "consistency_review") { const documentId = String(job.documentId ?? job.input.documentId ?? ""); const report = await runConsistencyReview({ projectId, documentId }); addArtifact({ jobId: job.id, type: "consistency-review", title: "一致性审查报告", content: report, metadata: { intent } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `一致性审查完成：${report.status}，问题 ${report.issues.length} 个；自动审查不等于人工批准。`, metadata: { jobId: job.id, intent, reportId: report.id } }); transitionJob(job.id, "completed"); return; }
  if (intent === "unsupported_claims") { const documentId = String(job.documentId ?? job.input.documentId ?? ""); const items = await listUnsupportedClaims(projectId, documentId); addArtifact({ jobId: job.id, type: "unsupported-claims", title: "未支持论断", content: items, metadata: { intent } }); addMessage(job.conversationId ?? "", { role: "assistant", content: items.length ? `找到 ${items.length} 条未支持论断，未自动写入引用。` : "当前没有登记的未支持论断。", metadata: { jobId: job.id, intent } }); transitionJob(job.id, "completed"); return; }
  if (intent === "full_text_search") { const query = String(job.input.query ?? job.prompt); const results = searchLocalFullText(projectId, query); addArtifact({ jobId: job.id, type: "full-text-search", title: "本地全文搜索", content: results, metadata: { intent, query } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `本地全文搜索完成：${results.length} 个页码命中。`, metadata: { jobId: job.id, intent } }); transitionJob(job.id, "completed"); return; }
  if (intent === "evidence_extraction") { const query = String(job.input.query ?? job.prompt).trim(); const results = searchLocalFullText(projectId, query); const workspace = await readWorkspace(projectId); const claimId = typeof job.input.claimId === "string" && workspace.claims.some((claim) => claim.id === job.input.claimId) ? job.input.claimId : undefined; const created = []; for (const result of results.slice(0, 20)) { const work = workspace.works.find((item) => item.id === result.workId); if (!work || work.bibliographicStatus !== "verified" || work.retractionStatus === "retracted") continue; try { created.push(await createEvidenceExcerpt({ workId: work.id, fullTextAssetId: result.assetId, page: result.page, locator: `PDF page ${result.page}`, claimId, paraphrase: result.text.slice(0, 2000), supportDirection: "supporting", strength: "medium", relevance: "medium", verificationStatus: "ai_suggested", externalModelUsePermission: "prohibited", exportPermission: "unknown" }, projectId)); } catch { /* keep the search result available even if a candidate excerpt needs manual correction */ } } addArtifact({ jobId: job.id, type: "evidence-excerpts", title: "AI建议证据摘录", content: created, metadata: { intent, query, verificationStatus: "ai_suggested", requiresHumanReview: true } }); addMessage(job.conversationId ?? "", { role: "assistant", content: created.length ? `已从本地全文生成 ${created.length} 条 ai_suggested 摘录；尚未人工核验，不能直接进入正式稿。` : "没有找到可用于生成摘录的已核验 Work 全文；候选文献不会被伪装成证据。", metadata: { jobId: job.id, intent, readOnly: false } }); transitionJob(job.id, "completed"); return; }
  if (intent === "literature_search") { const results = await runWithHeartbeat(job, owner, (signal) => searchAcademicMetadata(job.prompt, { perProvider: 10, signal }), leaseMs) as Awaited<ReturnType<typeof searchAcademicMetadata>>; for (const candidate of results.candidates) saveCandidateRecord({ id: stableCandidateId(projectId, candidate.provider, candidate.sourceId), projectId, provider: candidate.provider, providerRecordId: candidate.sourceId, title: candidate.title, authors: candidate.authors, year: candidate.year, venue: candidate.venue, doi: candidate.doi, url: candidate.url, abstract: candidate.abstract }); addArtifact({ jobId: job.id, type: "candidate-search", title: "候选文献（未核验）", content: results, metadata: { intent, provenance: "metadata-discovery" } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `已找到 ${results.candidates.length} 条候选文献；它们仍是 metadata-discovery，尚未写入正式引用。`, metadata: { jobId: job.id, intent } }); transitionJob(job.id, "completed"); return; }
  if (intent === "bibliographic_verification") { const candidateId = String(job.input.candidateId ?? ""); const result = await verifyCandidateBibliography({ projectId, candidateId }); addArtifact({ jobId: job.id, type: "verification-event", title: "书目核验事件", content: result, metadata: { intent } }); addMessage(job.conversationId ?? "", { role: "assistant", content: `书目核验结果：${result.event.result}。只有 verified 才会升级为 Work。`, metadata: { jobId: job.id, intent } }); transitionJob(job.id, "completed"); return; }
  if (intent === "section_revision") { const documentId = String(job.documentId ?? job.input.documentId ?? ""); const sectionId = String(job.input.sectionId ?? ""); const revisionDraft = await runWithHeartbeat(job, owner, (signal) => proposeSectionRevision({ projectId, documentId, sectionId, profileId: text(job.input.profileId) || undefined, signal }), leaseMs) as Awaited<ReturnType<typeof proposeSectionRevision>>; const revision = createRevisionProposal({ projectId, documentId, sectionId, beforeText: revisionDraft.beforeText, afterText: revisionDraft.afterText, metadata: { intent, citationIds: revisionDraft.citationIds, claimIds: revisionDraft.claimIds, evidenceExcerptIds: revisionDraft.evidenceExcerptIds, evidenceBundleId: revisionDraft.evidenceBundleId, evidenceGaps: revisionDraft.draft.evidenceGaps, attempts: revisionDraft.attempts, requiresApproval: true } }); addArtifact({ jobId: job.id, type: "revision-diff", title: "章节修改建议", content: { revisionId: revision.id, before: revision.beforeText, after: revision.afterText }, metadata: { intent, requiresApproval: true } }); addMessage(job.conversationId ?? "", { role: "assistant", content: "已根据当前项目证据包生成章节修改 diff。正文尚未改变；请审核 diff 后明确应用。", metadata: { jobId: job.id, intent, revisionId: revision.id } }); transitionJob(job.id, "completed"); return; }
  throw new Error(`暂不支持助手意图：${intent}`);
}

async function processJob(job: ResearchJob, owner: string, leaseMs: number) {
  try { if (job.kind === "proposal-generation") await processProposal(job, owner, leaseMs); else if (job.kind === "topic-batch-assessment") await processTopicBatch(job, owner, leaseMs); else if (job.kind.startsWith("assistant-")) await processAssistantTask(job, owner, leaseMs); else await processIdeaAssessment(job, owner, leaseMs); }
  catch (error) {
    if (error instanceof JobControlError) return;
    const category = retryCategory(error);
    const metadata = error instanceof ProviderCallError
      ? { category, attempts: error.attempts }
      : { category, message: error instanceof Error ? error.message : String(error) };
    if (job.kind === "topic-batch-assessment" && job.topicBatchId) { try { updateTopicBatch(job.topicBatchId, { status: "failed" }); } catch { /* batch may have been removed */ } }
    try { transitionJob(job.id, "failed", JSON.stringify(metadata)); } catch { /* already transitioned by user action */ }
  }
}

export async function runResearchWorker(options: WorkerOptions = {}) {
  const owner = options.workerId ?? `worker-${process.pid}`;
  const leaseMs = options.leaseMs ?? 120_000;
  do {
    recoverExpiredJobs();
    const job = claimNextJob(owner, leaseMs);
    if (job) await processJob(job, owner, leaseMs);
    else if (!options.once) await sleep(options.pollMs ?? 2000);
    else break;
  } while (!options.once);
}

if (process.argv[1]?.endsWith("research-worker.ts")) runResearchWorker().catch((error) => { console.error(error); process.exitCode = 1; });

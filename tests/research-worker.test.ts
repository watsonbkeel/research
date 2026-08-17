import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  callProvider: vi.fn(),
  recordAttempts: vi.fn(),
  search: vi.fn(),
  saveSectionDraft: vi.fn(),
}));

vi.mock("@/lib/storage", () => ({
  readPrivateSettings: vi.fn(async () => ({ profiles: [], routes: [], allowFullText: false })),
  readWorkspace: vi.fn(async () => ({ project: { titleEn: "AI-assisted descriptions in C2C resale markets" } })),
  recordGenerationAttempts: mocks.recordAttempts,
}));

vi.mock("@/lib/provider-client", () => ({
  callOpenAICompatible: mocks.callProvider,
  ProviderCallError: class ProviderCallError extends Error {
    category: string;
    attempts: unknown[];
    constructor(message = "Provider failed", category = "unknown", attempts: unknown[] = []) {
      super(message);
      this.category = category;
      this.attempts = attempts;
    }
  },
  classifyProviderError: (error: unknown) => error instanceof TypeError ? "network" : "unknown",
}));

vi.mock("@/lib/assistant-search", () => ({ searchAcademicMetadata: mocks.search }));

vi.mock("@/lib/manuscript", () => ({
  readManuscript: vi.fn(() => ({
    id: "manuscript-1",
    title: "AI and buyer responses",
    chapters: [{ id: "chapter-1", title: "Introduction", sections: [
      { id: "section-1", number: "1.1", title: "Background", targetWords: 500, researchStatus: "planned" },
      { id: "section-2", number: "1.2", title: "Research problem", targetWords: 500, researchStatus: "planned" },
    ] }],
  })),
  saveSectionDraft: mocks.saveSectionDraft,
}));

vi.mock("@/lib/evidence-excerpts", () => ({ listEvidenceExcerpts: vi.fn(async () => []) }));

import { addArtifact, addMessage, claimNextJob, createConversation, createResearchJob, getResearchJob, listArtifacts, listCandidates, listJobEvents, listMessages, listResearchJobs, transitionJob } from "@/lib/assistant";
import { ProviderCallError } from "@/lib/provider-client";
import { runResearchWorker } from "@/scripts/research-worker";

const dirs: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  const dir = mkdtempSync(path.join("/tmp", "research-worker-test-"));
  dirs.push(dir);
  process.env.WORKBENCH_DATA_DIR = dir;
  mocks.search.mockResolvedValue({
    query: "AI resale trust",
    candidates: [{ id: "openalex:W1", provider: "openalex", sourceId: "W1", title: "AI descriptions and trust", authors: ["A. Author"], year: 2025, url: "https://example.test/W1", retrievedAt: "2026-08-10T00:00:00.000Z", provenance: "metadata-discovery" }],
    failures: [],
    providers: ["openalex"],
  });
  mocks.saveSectionDraft.mockReturnValue({ version: { id: "draft-1" } });
});

afterEach(() => {
  const dir = dirs.pop();
  if (dir) rmSync(dir, { recursive: true, force: true });
  delete process.env.WORKBENCH_DATA_DIR;
  delete process.env.RESEARCH_STAGE_MAX_RETRIES;
  delete process.env.RESEARCH_RETRY_BASE_MS;
});

describe("research worker", () => {
  it("searches metadata and persists a feasibility result for confirmation", async () => {
    mocks.callProvider.mockImplementation(async (request: { taskType: string }) => ({
      content: request.taskType === "literature_search"
        ? JSON.stringify({ readyForAssessment: true, queries: ["AI resale trust"], researchQuestion: "RQ" })
        : JSON.stringify({ verdict: "promising", researchQuestion: "Does disclosure affect contact intention?", theoreticalBasis: "Signalling theory", researchGap: "Limited C2C evidence", designRecommendation: "Randomised experiment", risks: "Proxy outcome", followUpQuestions: [] }),
      profile: { id: "profile-a", name: "Model A", provider: "test", baseUrl: "https://example.test/v1", model: "test-model", priority: 1 },
      attempts: [],
    }));
    const conversation = createConversation({ title: "Idea" });
    addMessage(conversation.id, { role: "user", content: "我想研究 AI 文案如何影响联系卖家意愿。" });
    const job = createResearchJob({ conversationId: conversation.id, prompt: "我想研究 AI 文案如何影响联系卖家意愿。", kind: "idea-assessment" });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(job.id)).toMatchObject({ status: "waiting-confirmation", stage: "feasibility", progress: 100, profileId: "profile-a" });
    expect(listCandidates(job.id)).toHaveLength(1);
    expect(listArtifacts(job.id).map((artifact) => artifact.type)).toContain("feasibility-report");
    expect(listMessages(conversation.id).at(-1)?.content).toContain("可行性结论：promising");
  });

  it("does not repeat intake questions when autonomous proposal generation was requested", async () => {
    mocks.callProvider.mockImplementation(async (request: { taskType: string }) => ({
      content: request.taskType === "literature_search"
        ? JSON.stringify({ readyForAssessment: false, queries: ["AI resale trust"], followUpQuestions: ["Which platform?"] })
        : JSON.stringify({ verdict: "needs_revision", researchQuestion: "Converged RQ", theoreticalBasis: "Signalling theory", researchGap: "Proposed gap", designRecommendation: "Use a preregistered experiment", risks: ["Evidence requires verification"], followUpQuestions: ["Optional refinement?"] }),
      profile: { id: "profile-a", name: "Model A", provider: "test", baseUrl: "https://example.test/v1", model: "test-model", priority: 1 },
      attempts: [],
    }));
    const conversation = createConversation({ title: "Autonomous proposal" });
    addMessage(conversation.id, { role: "user", content: "不要再问，请自己判断并完成开题报告。" });
    const assessment = createResearchJob({ conversationId: conversation.id, prompt: "不要再问，请自己判断并完成开题报告。", kind: "idea-assessment", input: { autoGenerateProposal: true } });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(assessment.id)?.status).toBe("completed");
    const proposal = listResearchJobs(conversation.id).find((job) => job.kind === "proposal-generation");
    expect(proposal).toMatchObject({ status: "queued", profileId: "profile-a" });
    expect(listMessages(conversation.id).at(-1)?.content).toContain("已进入后台生成队列");
  });

  it("moves to proposal confirmation after one feasibility revision round", async () => {
    mocks.callProvider.mockImplementation(async (request: { taskType: string }) => ({
      content: request.taskType === "literature_search"
        ? JSON.stringify({ readyForAssessment: true, queries: ["AI resale trust"] })
        : JSON.stringify({ verdict: "needs_revision", researchQuestion: "Converged RQ", theoreticalBasis: "Signalling theory", researchGap: "Proposed gap", designRecommendation: "Experiment", risks: [], followUpQuestions: ["Another optional choice?"] }),
      profile: { id: "profile-a", name: "Model A", provider: "test", baseUrl: "https://example.test/v1", model: "test-model", priority: 1 },
      attempts: [],
    }));
    const conversation = createConversation({ title: "One revision" });
    addMessage(conversation.id, { role: "user", content: "全部接受，继续。" });
    const job = createResearchJob({ conversationId: conversation.id, prompt: "全部接受，继续。", kind: "idea-assessment", input: { revisionRound: 1 } });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(job.id)?.status).toBe("waiting-confirmation");
    expect(listMessages(conversation.id).at(-1)?.content).toContain("不再重复追问");
  });

  it("automatically retries transient provider failures with a bounded delay", async () => {
    process.env.RESEARCH_STAGE_MAX_RETRIES = "2";
    process.env.RESEARCH_RETRY_BASE_MS = "1";
    let intakeAttempts = 0;
    mocks.callProvider.mockImplementation(async (request: { taskType: string }) => {
      if (request.taskType === "literature_search" && intakeAttempts++ < 2) {
        throw new ProviderCallError("Temporary network failure", "network", []);
      }
      return {
        content: request.taskType === "literature_search"
          ? JSON.stringify({ readyForAssessment: true, queries: ["AI resale trust"] })
          : JSON.stringify({ verdict: "promising", researchQuestion: "RQ", theoreticalBasis: "Signalling theory", researchGap: "Gap", designRecommendation: "Experiment", risks: [], followUpQuestions: [] }),
        profile: { id: "profile-a", name: "Model A", provider: "test", baseUrl: "https://example.test/v1", model: "test-model", priority: 1 },
        attempts: [],
      };
    });
    const conversation = createConversation({ title: "Retry transient failures" });
    const job = createResearchJob({ conversationId: conversation.id, prompt: "Assess this idea", kind: "idea-assessment" });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(job.id)?.status).toBe("waiting-confirmation");
    expect(mocks.callProvider).toHaveBeenCalledTimes(4);
    expect(listJobEvents(job.id).filter((event) => event.type === "stage-retry").map((event) => event.payload)).toEqual([
      expect.objectContaining({ attempt: 1, maxRetries: 2, category: "network", delayMs: 1 }),
      expect.objectContaining({ attempt: 2, maxRetries: 2, category: "network", delayMs: 2 }),
    ]);
  });

  it("does not retry a non-transient provider failure", async () => {
    process.env.RESEARCH_RETRY_BASE_MS = "1";
    mocks.callProvider.mockRejectedValue(new ProviderCallError("Bad credentials", "authentication", []));
    const job = createResearchJob({ prompt: "Assess this idea", kind: "idea-assessment" });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(job.id)).toMatchObject({ status: "failed" });
    expect(mocks.callProvider).toHaveBeenCalledTimes(1);
    expect(listJobEvents(job.id).filter((event) => event.type === "stage-retry")).toHaveLength(0);
  });

  it("uses conversation context and the feasibility report when saving proposal drafts", async () => {
    mocks.callProvider.mockResolvedValue({
      content: "This proposed study will test how AI disclosure affects seller-contact intention.",
      profile: { id: "profile-a", name: "Model A", provider: "test", baseUrl: "https://example.test/v1", model: "test-model", priority: 1 },
      attempts: [],
    });
    const conversation = createConversation({ title: "Proposal" });
    addMessage(conversation.id, { role: "user", content: "研究 AI 声明对买家联系卖家意愿的影响。" });
    const assessment = createResearchJob({ conversationId: conversation.id, prompt: "Research idea", kind: "idea-assessment", input: { profileId: "profile-a" } });
    claimNextJob("setup-worker");
    addArtifact({ jobId: assessment.id, type: "feasibility-report", content: { verdict: "promising", researchGap: "Limited evidence in C2C resale" } });
    transitionJob(assessment.id, "completed");
    const proposal = createResearchJob({ conversationId: conversation.id, prompt: "Research idea", kind: "proposal-generation", input: { feasibilityJobId: assessment.id, profileId: "profile-a", stage: "proposal-outline" } });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(proposal.id)).toMatchObject({ status: "completed", stage: "consistency-review", progress: 100 });
    expect(mocks.saveSectionDraft).toHaveBeenCalledWith(expect.objectContaining({ manuscriptId: "manuscript-1", sectionId: "section-1", content: expect.stringContaining("proposed study") }));
    const providerPrompt = mocks.callProvider.mock.calls[0][0].prompt as string;
    expect(providerPrompt).toContain("研究 AI 声明");
    expect(providerPrompt).toContain("Limited evidence in C2C resale");
    expect(listArtifacts(proposal.id).map((artifact) => artifact.type)).toContain("draft-version");
  });

  it("retries only the failed proposal section and preserves completed sections", async () => {
    process.env.RESEARCH_STAGE_MAX_RETRIES = "2";
    process.env.RESEARCH_RETRY_BASE_MS = "1";
    mocks.callProvider
      .mockResolvedValueOnce({ content: "Completed section one.", profile: { id: "profile-a", name: "Model A", provider: "test", model: "test-model" }, attempts: [] })
      .mockRejectedValueOnce(new ProviderCallError("Provider unavailable", "provider_unavailable", []))
      .mockResolvedValueOnce({ content: "Completed section two.", profile: { id: "profile-a", name: "Model A", provider: "test", model: "test-model" }, attempts: [] });
    const conversation = createConversation({ title: "Proposal retry" });
    const proposal = createResearchJob({ conversationId: conversation.id, prompt: "Generate proposal", kind: "proposal-generation" });

    await runResearchWorker({ once: true, workerId: "test-worker" });

    expect(getResearchJob(proposal.id)).toMatchObject({ status: "completed", input: { completedSections: ["section-1", "section-2"] } });
    expect(mocks.saveSectionDraft.mock.calls.map(([input]) => input.sectionId)).toEqual(["section-1", "section-2"]);
    expect(mocks.callProvider).toHaveBeenCalledTimes(3);
    expect(listJobEvents(proposal.id).filter((event) => event.type === "stage-retry")).toHaveLength(1);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { addArtifact, claimNextJob, createConversation, createResearchJob, getResearchJob, listResearchJobs, transitionJob } from "@/lib/assistant";
import { POST as postMessage } from "@/app/api/assistant/conversations/[conversationId]/messages/route";
import { POST as postAction } from "@/app/api/assistant/jobs/[jobId]/actions/route";
import { GET as getEvents } from "@/app/api/assistant/jobs/[jobId]/events/route";

const dirs: string[] = [];
afterEach(() => {
  const dir = dirs.pop();
  if (dir) rmSync(dir, { recursive: true, force: true });
  delete process.env.WORKBENCH_DATA_DIR;
});

function isolated() {
  const dir = mkdtempSync(path.join("/tmp", "assistant-route-test-"));
  dirs.push(dir);
  process.env.WORKBENCH_DATA_DIR = dir;
}

function messageRequest(content: string, profileId?: string) {
  return new Request("http://localhost/api/assistant/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, ...(profileId ? { profileId } : {}) }),
  });
}

describe("assistant orchestration routes", () => {
  it("queues messages, rejects overlap, and resumes a waiting conversation", async () => {
    isolated();
    const conversation = createConversation({ title: "Idea" });
    const context = { params: Promise.resolve({ conversationId: conversation.id }) };
    const firstResponse = await postMessage(messageRequest("Initial idea", "profile-a"), context);
    const firstPayload = await firstResponse.json();
    expect(firstResponse.status).toBe(202);
    expect(firstPayload.job.status).toBe("queued");

    const blockedResponse = await postMessage(messageRequest("Too soon"), context);
    expect(blockedResponse.status).toBe(409);

    claimNextJob("worker-a");
    transitionJob(firstPayload.job.id, "waiting-user");
    const followUpResponse = await postMessage(messageRequest("Here is the missing detail"), context);
    const followUpPayload = await followUpResponse.json();
    expect(followUpResponse.status).toBe(202);
    expect(getResearchJob(firstPayload.job.id)?.status).toBe("completed");
    expect(followUpPayload.job.profileId).toBe("profile-a");
    expect(followUpPayload.job.input.previousJobId).toBe(firstPayload.job.id);
  });

  it("records an autonomous proposal request on the first message", async () => {
    isolated();
    const conversation = createConversation({ title: "Direct proposal" });
    const response = await postMessage(messageRequest("不要再问开放问题，请自己判断并完成开题报告输出。", "profile-a"), { params: Promise.resolve({ conversationId: conversation.id }) });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job.kind).toBe("idea-assessment");
    expect(payload.job.input.autoGenerateProposal).toBe(true);
  });

  it("skips reassessment when a waiting feasibility report receives a direct drafting command", async () => {
    isolated();
    const conversation = createConversation({ title: "Converged proposal" });
    const assessment = createResearchJob({ conversationId: conversation.id, prompt: "Idea", kind: "idea-assessment", input: { profileId: "profile-a", stage: "feasibility" } });
    claimNextJob("worker-a");
    addArtifact({ jobId: assessment.id, type: "feasibility-report", content: { verdict: "needs_revision", researchQuestion: "RQ" } });
    transitionJob(assessment.id, "waiting-user");

    const response = await postMessage(messageRequest("全部接受，继续。"), { params: Promise.resolve({ conversationId: conversation.id }) });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job.kind).toBe("proposal-generation");
    expect(payload.job.input.feasibilityJobId).toBe(assessment.id);
    expect(payload.job.profileId).toBe("profile-a");
    expect(getResearchJob(assessment.id)?.status).toBe("completed");
    expect(listResearchJobs(conversation.id).filter((job) => job.kind === "idea-assessment")).toHaveLength(1);
  });

  it("inherits the selected model when proposal generation is confirmed", async () => {
    isolated();
    const conversation = createConversation({ title: "Proposal" });
    const assessment = createResearchJob({ conversationId: conversation.id, prompt: "Idea", kind: "idea-assessment", input: { profileId: "profile-a" } });
    claimNextJob("worker-a");
    addArtifact({ jobId: assessment.id, type: "feasibility-report", content: { verdict: "needs_revision" } });
    transitionJob(assessment.id, "waiting-confirmation");

    const response = await postAction(new Request("http://localhost/actions", { method: "POST", body: JSON.stringify({ action: "confirm-proposal" }) }), { params: Promise.resolve({ jobId: assessment.id }) });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(getResearchJob(assessment.id)?.status).toBe("completed");
    expect(payload.job.kind).toBe("proposal-generation");
    expect(payload.job.profileId).toBe("profile-a");
    expect(listResearchJobs(conversation.id)).toHaveLength(2);
  });

  it("allows an explicit button action from waiting-user when feasibility exists", async () => {
    isolated();
    const conversation = createConversation({ title: "Force proposal" });
    const assessment = createResearchJob({ conversationId: conversation.id, prompt: "Idea", kind: "idea-assessment" });
    claimNextJob("worker-a");
    addArtifact({ jobId: assessment.id, type: "feasibility-report", content: { verdict: "needs_revision" } });
    transitionJob(assessment.id, "waiting-user");

    const response = await postAction(new Request("http://localhost/actions", { method: "POST", body: JSON.stringify({ action: "confirm-proposal" }) }), { params: Promise.resolve({ jobId: assessment.id }) });
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload.job.kind).toBe("proposal-generation");
    expect(getResearchJob(assessment.id)?.status).toBe("completed");
  });

  it("closes an event stream after a terminal event", async () => {
    isolated();
    const job = createResearchJob({ prompt: "Done" });
    claimNextJob("worker-a");
    transitionJob(job.id, "completed");

    const response = await getEvents(new Request(`http://localhost/events/${job.id}`), { params: Promise.resolve({ jobId: job.id }) });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("event: completed");
  });
});

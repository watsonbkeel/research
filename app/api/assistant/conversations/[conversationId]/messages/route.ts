import { NextResponse } from "next/server";
import { addMessage, conversationMessageInputSchema, createProposalGenerationJob, createResearchJob, getConversation, getResearchJob, listArtifacts, listMessages, listResearchJobs, messageInputSchema, transitionJob } from "@/lib/assistant";
import { requestsProposalGeneration } from "@/lib/assistant-intent";
export const runtime = "nodejs";
type Context = { params: Promise<{ conversationId: string }> };
export async function GET(_request: Request, context: Context) { const { conversationId } = await context.params; if (!getConversation(conversationId)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 }); return NextResponse.json({ messages: listMessages(conversationId) }); }
export async function POST(request: Request, context: Context) {
  const { conversationId } = await context.params;
  if (!getConversation(conversationId)) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const orchestration = conversationMessageInputSchema.safeParse(body);
  if (orchestration.success) {
    const jobs = listResearchJobs(conversationId);
    const waitingJob = jobs.find((job) => job.status === "waiting-user" || job.status === "waiting-confirmation");
    const blockingJob = jobs.find((job) => ["queued", "running", "paused"].includes(job.status));
    if (blockingJob) return NextResponse.json({ error: "当前对话已有未结束的任务，请先等待、继续或取消该任务。" }, { status: 409 });

    const selectedProfileId = orchestration.data.profileId ?? waitingJob?.profileId ?? undefined;
    const directProposalRequest = requestsProposalGeneration(orchestration.data.content);
    const previousHasFeasibility = Boolean(waitingJob && listArtifacts(waitingJob.id).some((artifact) => artifact.type === "feasibility-report"));
    const message = addMessage(conversationId, {
      role: "user",
      content: orchestration.data.content,
      metadata: selectedProfileId ? { profileId: selectedProfileId } : undefined,
    });
    if (waitingJob && directProposalRequest && previousHasFeasibility) {
      const job = createProposalGenerationJob(waitingJob.id, orchestration.data.content);
      addMessage(conversationId, { role: "assistant", content: "收到。已有可行性报告足以进入写作，我会按当前最佳方案直接生成英文 Confirmation Proposal；剩余非阻断性问题将作为工作假设或待核验项标注，不再重复追问。", metadata: { jobId: job.id, stage: "proposal-outline" } });
      transitionJob(waitingJob.id, "completed");
      return NextResponse.json({ message, job, sourceJob: getResearchJob(waitingJob.id) }, { status: 202 });
    }

    if (waitingJob) transitionJob(waitingJob.id, "completed");
    const previousClarificationRound = typeof waitingJob?.input.clarificationRound === "number" ? waitingJob.input.clarificationRound : 0;
    const previousRevisionRound = typeof waitingJob?.input.revisionRound === "number" ? waitingJob.input.revisionRound : 0;
    const job = createResearchJob({
      conversationId,
      prompt: orchestration.data.content,
      kind: "idea-assessment",
      input: {
        ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
        ...(waitingJob ? { previousJobId: waitingJob.id } : {}),
        ...(directProposalRequest ? { autoGenerateProposal: true } : {}),
        clarificationRound: waitingJob?.stage === "idea-intake" ? previousClarificationRound + 1 : previousClarificationRound,
        revisionRound: waitingJob?.stage === "feasibility" ? previousRevisionRound + 1 : previousRevisionRound,
      },
    });
    return NextResponse.json({ message, job }, { status: 202 });
  }
  const parsed = messageInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  return NextResponse.json(addMessage(conversationId, parsed.data), { status: 201 });
}

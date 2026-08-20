import { NextResponse } from "next/server";
import { addMessage, conversationMessageInputSchema, createProposalGenerationJob, createResearchJob, getConversation, getResearchJob, listArtifacts, listMessages, listResearchJobs, messageInputSchema, transitionJob } from "@/lib/assistant";
import { planAssistantIntent, requestsProposalGeneration } from "@/lib/assistant-intent";
import { getProjectSnapshot, getCurrentDocument, getQualityBlockers } from "@/lib/assistant-tools";
import { bindAssistantWorkflowToJob, startAssistantWorkflow } from "@/lib/assistant-workflow";
import { getProjectDocument } from "@/lib/project-documents";
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
    const conversation = getConversation(conversationId)!;
    let plan = planAssistantIntent(orchestration.data.content, { projectId: conversation.projectId, documentId: typeof conversation.metadata.documentId === "string" ? conversation.metadata.documentId : undefined });
    const requestedChapter = plan.sectionId?.match(/^chapter-(\d+)-main$/)?.[1];
    if (requestedChapter && plan.projectId && plan.documentId) {
      const document = getProjectDocument(plan.projectId, plan.documentId);
      const sectionId = document?.manuscript.chapters.find((chapter) => Number(chapter.number) === Number(requestedChapter))?.sections[0]?.id;
      if (sectionId) plan = { ...plan, sectionId };
    }
    if (blockingJob && plan.readOnly) {
      const [snapshot, document, quality] = conversation.projectId ? await Promise.all([getProjectSnapshot(conversation.projectId), getCurrentDocument(conversation.projectId, plan.documentId), getQualityBlockers(conversation.projectId, plan.documentId)]) : [undefined, undefined, undefined];
      const reply = plan.intent === "qa" ? `当前项目快照：${snapshot ? `${snapshot.project.titleEn}；${snapshot.workspace.works} 篇 Work，${snapshot.evidence.humanVerified} 条 human_verified 证据。` : "尚未绑定项目。"}` : `只读请求已执行：${plan.intent}。当前任务仍在运行，因此没有执行任何写操作。${document ? `当前文档为 ${document.title}。` : ""}${quality?.citationAudit ? ` 最近一次引用审查状态：${quality.citationAudit.status}。` : ""}`;
      const message = addMessage(conversationId, { role: "user", content: orchestration.data.content, metadata: { plan } }); const assistant = addMessage(conversationId, { role: "assistant", content: reply, metadata: { plan, readOnly: true, blockingJobId: blockingJob.id } }); return NextResponse.json({ message, assistant, plan }, { status: 200 });
    }
    if (blockingJob) return NextResponse.json({ error: "当前对话已有冲突的写任务，请先等待、继续或取消该任务。只读检查和问答仍可执行。" }, { status: 409 });
    const selectedProfileId = orchestration.data.profileId ?? waitingJob?.profileId ?? undefined;
    const directProposalRequest = requestsProposalGeneration(orchestration.data.content);
    const previousHasFeasibility = Boolean(waitingJob && listArtifacts(waitingJob.id).some((artifact) => artifact.type === "feasibility-report"));
    const message = addMessage(conversationId, {
      role: "user",
      content: orchestration.data.content,
      metadata: selectedProfileId ? { profileId: selectedProfileId } : undefined,
    });
    let workflow = plan.intent === "section_revision" && plan.projectId && plan.documentId
      ? startAssistantWorkflow({ projectId: plan.projectId, documentId: plan.documentId, sectionId: plan.sectionId, intent: plan.intent, idempotencyKey: `${conversationId}:${plan.documentId}:${plan.sectionId ?? "document"}:${orchestration.data.content.slice(0, 120)}`, conversationId, prompt: orchestration.data.content, profileId: selectedProfileId })
      : undefined;
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
      kind: directProposalRequest ? "idea-assessment" : `assistant-${plan.intent}`,
      input: {
        ...(plan.projectId ? { projectId: plan.projectId } : {}), ...(plan.documentId ? { documentId: plan.documentId } : {}), ...(plan.sectionId ? { sectionId: plan.sectionId } : {}), assistantPlan: plan,
        ...(selectedProfileId ? { profileId: selectedProfileId } : {}),
        ...(waitingJob ? { previousJobId: waitingJob.id } : {}),
        ...(directProposalRequest ? { autoGenerateProposal: true } : {}), ...(workflow ? { workflowRunId: workflow.id } : {}),
        clarificationRound: waitingJob?.stage === "idea-intake" ? previousClarificationRound + 1 : previousClarificationRound,
        revisionRound: waitingJob?.stage === "feasibility" ? previousRevisionRound + 1 : previousRevisionRound,
      },
    });
    if (workflow) workflow = bindAssistantWorkflowToJob(conversation.projectId!, workflow.id, job.id);
    return NextResponse.json({ message, job, workflow }, { status: 202 });
  }
  const parsed = messageInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  return NextResponse.json(addMessage(conversationId, parsed.data), { status: 201 });
}

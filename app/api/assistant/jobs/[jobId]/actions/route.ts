import { NextResponse } from "next/server";
import { actionInputSchema, addMessage, createProposalGenerationJob, getResearchJob, transitionJob, updateResearchJob } from "@/lib/assistant";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  const job = getResearchJob(jobId);
  if (!job) return NextResponse.json({ error: "Job not found" }, { status: 404 });
  const parsed = actionInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  try {
    if (parsed.data.action === "confirm-proposal") {
      if (!["waiting-confirmation", "waiting-user"].includes(job.status)) return NextResponse.json({ error: "该任务当前不能生成 Proposal。" }, { status: 409 });
      const proposalJob = createProposalGenerationJob(job.id);
      if (job.conversationId) addMessage(job.conversationId, { role: "assistant", content: "已按当前最佳方案开始生成英文 Confirmation Proposal。剩余非阻断性问题将作为工作假设或待核验项标注。", metadata: { jobId: proposalJob.id, stage: "proposal-outline" } });
      transitionJob(job.id, "completed");
      return NextResponse.json({ job: proposalJob, sourceJob: getResearchJob(job.id) }, { status: 202 });
    }
    const target = parsed.data.action === "resume" || parsed.data.action === "retry" ? "queued" : parsed.data.action === "pause" ? "paused" : "cancelled";
    const next = transitionJob(jobId, target);
    if (target === "queued") updateResearchJob(jobId, { input: { pauseRequested: false } });
    return NextResponse.json(next);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid action" }, { status: 409 });
  }
}

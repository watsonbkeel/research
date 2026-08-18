import { NextResponse } from "next/server";
import { actionInputSchema, addMessage, createProposalGenerationJob, getResearchJob, transitionJob, updateResearchJob } from "@/lib/assistant";
import { getRevisionProposal, markRevisionApplied } from "@/lib/evidence-store";
import { saveProjectSection } from "@/lib/project-documents";
import { runCitationAudit } from "@/lib/citation-audit";
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
    if (parsed.data.action === "apply-revision") {
      if (!parsed.data.revisionId) return NextResponse.json({ error: "缺少revisionId。" }, { status: 400 });
      if (!job.projectId) return NextResponse.json({ error: "修改任务没有绑定项目，不能应用 diff。" }, { status: 409 });
      const proposal = getRevisionProposal(parsed.data.revisionId, job.projectId) as { projectId: string; documentId: string; sectionId: string; afterText: string; status: string; metadata?: Record<string, unknown> } | undefined; if (!proposal) return NextResponse.json({ error: "修改建议不存在或不属于当前项目。" }, { status: 404 });
      if (proposal.status !== "proposed") return NextResponse.json({ error: "该修改建议已经应用或不再可用。" }, { status: 409 });
      const metadata = proposal.metadata ?? {};
      const saved = saveProjectSection({ projectId: proposal.projectId as string, documentId: proposal.documentId as string, sectionId: proposal.sectionId as string, content: proposal.afterText as string, changeSummary: "Approved assistant revision", editor: "researcher", citationIds: Array.isArray(metadata.citationIds) ? metadata.citationIds.map(String) : undefined, claimIds: Array.isArray(metadata.claimIds) ? metadata.claimIds.map(String) : undefined, evidenceExcerptIds: Array.isArray(metadata.evidenceExcerptIds) ? metadata.evidenceExcerptIds.map(String) : undefined, evidenceBundleId: typeof metadata.evidenceBundleId === "string" ? metadata.evidenceBundleId : undefined, evidenceGaps: Array.isArray(metadata.evidenceGaps) ? metadata.evidenceGaps.map(String) : undefined });
      markRevisionApplied(parsed.data.revisionId);
      const audit = await runCitationAudit({ projectId: proposal.projectId as string, documentId: proposal.documentId as string, versionId: saved.version.id, formal: false });
      return NextResponse.json({ job, proposal, saved, audit });
    }
    const target = parsed.data.action === "resume" || parsed.data.action === "retry" ? "queued" : parsed.data.action === "pause" ? "paused" : "cancelled";
    const next = transitionJob(jobId, target);
    if (target === "queued") updateResearchJob(jobId, { input: { pauseRequested: false } });
    return NextResponse.json(next);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid action" }, { status: 409 });
  }
}

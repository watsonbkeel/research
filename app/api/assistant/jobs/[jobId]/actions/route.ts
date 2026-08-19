import { NextResponse } from "next/server";
import { actionInputSchema, addMessage, createProposalGenerationJob, getResearchJob, transitionJob, updateResearchJob } from "@/lib/assistant";
import { getRevisionProposal, markRevisionApplied } from "@/lib/evidence-store";
import { advanceAssistantWorkflow, resumeAssistantWorkflowAfterHumanVerification } from "@/lib/assistant-workflow";
import { promoteStructuredDraft } from "@/lib/generation-service";
import { updateEvidenceExcerpt } from "@/lib/evidence-excerpts";
import type { StructuredSectionDraft } from "@/lib/types";
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
    if (parsed.data.action === "approve-evidence") {
      if (!job.projectId) return NextResponse.json({ error: "证据核验任务没有绑定项目。" }, { status: 409 });
      if (job.status !== "waiting-user") return NextResponse.json({ error: "该任务当前不在人工证据核验门。" }, { status: 409 });
      const workflowRunId = typeof job.input.workflowRunId === "string" ? job.input.workflowRunId : undefined;
      if (!workflowRunId || !parsed.data.evidenceExcerptId || !parsed.data.reviewer) return NextResponse.json({ error: "缺少 workflowRunId、evidenceExcerptId 或 reviewer。" }, { status: 400 });
      const excerpt = await updateEvidenceExcerpt({ id: parsed.data.evidenceExcerptId, verificationStatus: "human_verified", reviewer: parsed.data.reviewer, reviewedAt: parsed.data.reviewedAt ?? new Date().toISOString() }, job.projectId);
      const workflow = resumeAssistantWorkflowAfterHumanVerification(job.projectId, workflowRunId);
      const resumedJob = transitionJob(job.id, "queued");
      return NextResponse.json({ job: resumedJob, workflow, excerpt }, { status: 202 });
    }
    if (parsed.data.action === "apply-revision") {
      if (!parsed.data.revisionId) return NextResponse.json({ error: "缺少revisionId。" }, { status: 400 });
      if (!job.projectId) return NextResponse.json({ error: "修改任务没有绑定项目，不能应用 diff。" }, { status: 409 });
      const proposal = getRevisionProposal(parsed.data.revisionId, job.projectId) as { projectId: string; documentId: string; sectionId: string; afterText: string; status: string; metadata?: Record<string, unknown> } | undefined; if (!proposal) return NextResponse.json({ error: "修改建议不存在或不属于当前项目。" }, { status: 404 });
      if (proposal.status !== "proposed") return NextResponse.json({ error: "该修改建议已经应用或不再可用。" }, { status: 409 });
      const metadata = proposal.metadata ?? {};
      const workflowRunId = typeof job.input.workflowRunId === "string" ? job.input.workflowRunId : undefined;
      if (workflowRunId) advanceAssistantWorkflow(job.projectId, workflowRunId, "applying_revision", { tool: "apply_approved_diff", inputSummary: parsed.data.revisionId, status: "running" });
      const structuredDraft = metadata.structuredDraft as StructuredSectionDraft | undefined; if (!structuredDraft) return NextResponse.json({ error: "修改建议缺少可审查的 StructuredDraft，不能应用。" }, { status: 409 });
      const saved = await promoteStructuredDraft({ projectId: proposal.projectId, documentId: proposal.documentId, sectionId: proposal.sectionId, draft: structuredDraft, editor: "researcher", evidenceBundleId: typeof metadata.evidenceBundleId === "string" ? metadata.evidenceBundleId : undefined, idempotencyKey: `approved-revision:${parsed.data.revisionId}` });
      if (saved.status !== "promoted") { if (workflowRunId) advanceAssistantWorkflow(job.projectId, workflowRunId, "blocked", { tool: "run_post_revision_audit", inputSummary: parsed.data.revisionId, outputSummary: `${saved.audit.blockers.length} blockers`, status: "blocked" }); return NextResponse.json({ error: "批准后的版本化复审仍被阻断，正文未改变。", saved }, { status: 409 }); }
      markRevisionApplied(parsed.data.revisionId); if (workflowRunId) advanceAssistantWorkflow(job.projectId, workflowRunId, "reauditing", { tool: "run_post_revision_audit", inputSummary: saved.documentVersion.id, status: "running" });
      if (workflowRunId) advanceAssistantWorkflow(job.projectId, workflowRunId, "completed", { tool: "create_document_version", inputSummary: saved.documentVersion.id, outputSummary: `post-revision audit ${saved.audit.status}`, status: "completed" });
      return NextResponse.json({ job, proposal, saved, audit: saved.audit });
    }
    const target = parsed.data.action === "resume" || parsed.data.action === "retry" ? "queued" : parsed.data.action === "pause" ? "paused" : "cancelled";
    const next = transitionJob(jobId, target);
    if (target === "queued") updateResearchJob(jobId, { input: { pauseRequested: false } });
    return NextResponse.json(next);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid action" }, { status: 409 });
  }
}

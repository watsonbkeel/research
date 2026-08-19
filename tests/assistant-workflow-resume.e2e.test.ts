import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as workflows from "@/lib/assistant-workflow";
import { createProject, registerProjectWork } from "@/lib/portfolio";
import { ensureProjectProposal, getProjectDocument, listDocumentVersions, saveProjectDocument } from "@/lib/project-documents";
import { createConversation, getResearchJob, listArtifacts } from "@/lib/assistant";
import { POST as postMessage } from "@/app/api/assistant/conversations/[conversationId]/messages/route";
import { POST as postAction } from "@/app/api/assistant/jobs/[jobId]/actions/route";
import { runResearchWorker } from "@/scripts/research-worker";
import { readWorkspace, writeWorkspaceState } from "@/lib/storage";
import { listCandidateRecords, updateWorkVerification } from "@/lib/evidence-store";
import { storePdfAsset } from "@/lib/full-text";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import type { Work } from "@/lib/types";

let directory = "";
const originalFetch = global.fetch;
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; global.fetch = originalFetch; directory = ""; });

function minimalPdf(text: string) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>", `<< /Length ${text.length + 44} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const encoder = new TextEncoder(); let source = "%PDF-1.4\n"; const offsets = [0]; objects.forEach((object, index) => { offsets.push(encoder.encode(source).length); source += `${index + 1} 0 obj\n${object}\nendobj\n`; }); const xref = encoder.encode(source).length; source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`; for (let index = 1; index < offsets.length; index += 1) source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`; source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`; return new Uint8Array(encoder.encode(source));
}

describe("AssistantWorkflowRun resume regressions", () => {
  it("discovers only resumable non-terminal runs without crossing human gates", () => {
    directory = mkdtempSync(path.join(tmpdir(), "workflow-resume-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Workflow fixture", titleZh: "工作流测试", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" }); const document = ensureProjectProposal(project.id);
    const waiting = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "waiting" }); workflows.advanceAssistantWorkflow(project.id, waiting.id, "awaiting_human_verification");
    const active = workflows.startAssistantWorkflow({ projectId: project.id, documentId: document.id, intent: "section_revision", idempotencyKey: "active" }); workflows.advanceAssistantWorkflow(project.id, active.id, "auditing");
    const recover = (workflows as unknown as { recoverResumableAssistantWorkflows?: (projectId: string) => Array<{ id: string }> }).recoverResumableAssistantWorkflows;
    expect(recover).toBeTypeOf("function");
    expect(recover!(project.id).map((item) => item.id)).toEqual([active.id]);
    expect(workflows.getAssistantWorkflowRun(project.id, waiting.id)?.state).toBe("awaiting_human_verification");
  });

  it("resumes the same worker job after evidence approval and applies one approved revision", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "workflow-approval-e2e-")); process.env.WORKBENCH_DATA_DIR = directory; process.env.LLM_API_KEY = "fixture-model-key"; process.env.LLM_BASE_URL = "https://model.fixture/v1";
    const project = createProject({ titleEn: "Workflow fixture", titleZh: "工作流闭环", field: "Methods", context: "Fixture", institution: "Verified University", primaryOutcome: "Trust", secondaryOutcome: "Risk" });
    const document = ensureProjectProposal(project.id); const section = document.manuscript.chapters[2].sections[0];
    const work: Work = { id: "work-workflow", authors: "Li, Ming", year: 2024, title: "Workflow evidence", venue: "Fixture Journal", sourceType: "journal-article", doi: "10.5555/workflow", group: "理论来源", status: "书目信息已核对", bibliographicStatus: "verified", relevance: "fixture", retractionStatus: "clear" };
    registerProjectWork(project.id, work); updateWorkVerification(project.id, work.id, { id: "verification-workflow", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.doi!, checkedAt: "2026-08-19T00:00:00.000Z", matchedFields: { doi: true, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
    const workspace = await readWorkspace(project.id); workspace.works = [work]; workspace.claims = [{ id: "claim-workflow", text: "Prior studies show transparency affects trust", kind: "已发表事实", citationIds: [] }]; writeWorkspaceState("workspace", workspace, project.id);
    const editable = getProjectDocument(project.id, document.id)!; const editableSection = editable.manuscript.chapters[2].sections[0]; editableSection.content = "Prior studies show transparency affects trust."; editableSection.claimIds = ["claim-workflow"]; saveProjectDocument(project.id, document.id, editable.manuscript, { expectedVersion: editable.currentVersionNumber, editor: "Researcher" });
    await storePdfAsset({ projectId: project.id, workId: work.id, bytes: minimalPdf("Prior studies show transparency affects trust") });

    let approvedExcerptId = "";
    global.fetch = (async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname === "model.fixture") {
        const draft = { projectId: project.id, documentId: document.id, sectionId: section.id, paragraphs: [{ markdown: `Prior studies show transparency affects trust [[CITE:${work.id}]].`, claims: [{ claimId: "claim-workflow", claimText: "Prior studies show transparency affects trust", kind: "published_fact", evidenceExcerptIds: [approvedExcerptId], citationWorkIds: [work.id] }] }], unsupportedStatements: [], assumptions: [], evidenceGaps: [] };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(draft) } }] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const candidate = { DOI: work.doi, title: [work.title], author: [{ given: "Ming", family: "Li" }], published: { "date-parts": [[work.year]] }, "container-title": [work.venue] };
      if (url.hostname.includes("openalex")) return new Response(JSON.stringify({ results: [{ id: "https://openalex.org/W-FIXTURE", display_name: work.title, publication_year: work.year, doi: `https://doi.org/${work.doi}`, authorships: [{ author: { display_name: "Ming Li" } }], primary_location: { source: { display_name: work.venue } } }] }), { status: 200 });
      if (url.hostname.includes("semanticscholar")) return new Response(JSON.stringify({ data: [] }), { status: 200 });
      if (url.hostname.includes("crossref")) return new Response(JSON.stringify(url.pathname.includes(encodeURIComponent(work.doi!)) || url.pathname.includes(work.doi!) ? { message: candidate } : { message: { items: [candidate] } }), { status: 200 });
      return originalFetch(input, init);
    }) as typeof fetch;

    const conversation = createConversation({ title: "Citation repair", projectId: project.id, metadata: { documentId: document.id } });
    const startedResponse = await postMessage(new Request("http://localhost/api/assistant/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content: "第三章没有参考文献，帮我检查并补充。" }) }), { params: Promise.resolve({ conversationId: conversation.id }) });
    const started = await startedResponse.json(); expect(startedResponse.status).toBe(202); expect(started.workflow.sectionId).toBe(section.id); const jobId = String(started.job.id); const workflowId = String(started.workflow.id);
    await runResearchWorker({ once: true, workerId: "workflow-worker-1" });
    expect(getResearchJob(jobId)?.status).toBe("waiting-user"); expect(workflows.getAssistantWorkflowRun(project.id, workflowId)?.state).toBe("awaiting_human_verification"); expect(workflows.recoverResumableAssistantWorkflows(project.id)).toEqual([]);
    const suggestions = (await listEvidenceExcerpts({ projectId: project.id })).filter((item) => item.claimId === "claim-workflow"); expect(suggestions).toHaveLength(1); expect(suggestions[0].verificationStatus).toBe("ai_suggested"); approvedExcerptId = suggestions[0].id;
    const beforeApprovalContent = getProjectDocument(project.id, document.id)!.manuscript.chapters[2].sections[0].content; const beforeVersionCount = listDocumentVersions(project.id, document.id).length;
    const approvalResponse = await postAction(new Request("http://localhost/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve-evidence", evidenceExcerptId: approvedExcerptId, reviewer: "Researcher A", reviewedAt: "2026-08-19T02:00:00.000Z" }) }), { params: Promise.resolve({ jobId }) });
    expect(approvalResponse.status).toBe(202); expect(getResearchJob(jobId)?.status).toBe("queued"); expect((await listEvidenceExcerpts({ projectId: project.id }))[0]).toMatchObject({ verificationStatus: "human_verified", reviewer: "Researcher A" });
    await runResearchWorker({ once: true, workerId: "workflow-worker-2" });
    expect(getResearchJob(jobId)?.status).toBe("completed"); expect(workflows.getAssistantWorkflowRun(project.id, workflowId)?.state).toBe("awaiting_revision_approval"); expect(getProjectDocument(project.id, document.id)!.manuscript.chapters[2].sections[0].content).toBe(beforeApprovalContent);
    const revision = listArtifacts(jobId).find((item) => item.type === "revision-diff"); expect(revision).toBeDefined(); const revisionId = String((revision!.content as { revisionId: string }).revisionId);
    const applyResponse = await postAction(new Request("http://localhost/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply-revision", revisionId }) }), { params: Promise.resolve({ jobId }) });
    const applied = await applyResponse.json(); expect(applyResponse.status, JSON.stringify(applied)).toBe(200); expect(workflows.getAssistantWorkflowRun(project.id, workflowId)?.state).toBe("completed"); expect(listDocumentVersions(project.id, document.id)).toHaveLength(beforeVersionCount + 1); expect(getProjectDocument(project.id, document.id)!.manuscript.chapters[2].sections[0].content).toContain(`[[CITE:${work.id}]]`); expect(listCandidateRecords(project.id)).toHaveLength(1); expect(await listEvidenceExcerpts({ projectId: project.id })).toHaveLength(1);
    const duplicateApply = await postAction(new Request("http://localhost/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "apply-revision", revisionId }) }), { params: Promise.resolve({ jobId }) }); expect(duplicateApply.status).toBe(409); expect(listDocumentVersions(project.id, document.id)).toHaveLength(beforeVersionCount + 1);
  }, 30_000);
});

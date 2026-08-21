import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { POST, PATCH } from "@/app/api/projects/[projectId]/evidence-excerpts/route";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { storePdfAsset } from "@/lib/full-text";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { createEmptyEvidenceExcerptForm, changeEvidenceWork, evidenceExcerptToForm, evidenceFormToInput } from "@/lib/evidence-excerpt-form";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

function context(projectId: string) { return { params: Promise.resolve({ projectId }) }; }

function minimalPdf(text: string) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length + 44} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const encoder = new TextEncoder(); let source = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((object, index) => { offsets.push(encoder.encode(source).length); source += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = encoder.encode(source).length; source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index < offsets.length; index += 1) source += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(encoder.encode(source));
}

describe("Evidence edit integrity E2E", () => {
  it("cleans locators, invalidates verification, validates claims, and prevents Work/asset mismatches", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "evidence-edit-integrity-")); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Evidence edit integrity", titleZh: "证据编辑完整性", field: "Methods", context: "Fixture", institution: "University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const otherProject = createProject({ titleEn: "Other evidence project", titleZh: "其他项目", field: "Methods", context: "Fixture", institution: "Other", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const work = (id: string) => ({ id, authors: "Author", year: 2026, title: id, venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "unverified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" });
    const workA = work("work-a"); const workB = work("work-b");
    registerProjectWork(project.id, workA); registerProjectWork(project.id, workB);
    const workspace = await readWorkspace(project.id); workspace.works = [workA, workB]; workspace.claims = [
      { id: "claim-a1", text: "Claim A1", kind: "已发表事实", citationIds: [] },
      { id: "claim-a2", text: "Claim A2", kind: "已发表事实", citationIds: [] },
    ]; writeProjectState(project.id, "workspace", workspace);
    const otherWorkspace = await readWorkspace(otherProject.id); otherWorkspace.claims = [{ id: "claim-b1", text: "Claim B1", kind: "已发表事实", citationIds: [] }]; writeProjectState(otherProject.id, "workspace", otherWorkspace);
    for (const item of [workA, workB]) updateWorkVerification(project.id, item.id, { id: `verification-${item.id}`, projectId: project.id, workId: item.id, provider: "manual", inputIdentifier: item.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
    const assetA = await storePdfAsset({ projectId: project.id, workId: workA.id, bytes: minimalPdf("Evidence A") });
    const assetB = await storePdfAsset({ projectId: project.id, workId: workB.id, bytes: minimalPdf("Evidence B") });
    const initialForm = { ...createEmptyEvidenceExcerptForm(workA.id), fullTextAssetId: assetA.id, locatorType: "page" as const, page: "12", paraphrase: "Initial evidence", claimId: "claim-a1", reviewer: "Alice", reviewedAtLocal: "2026-08-20T01:00", verificationStatus: "human_verified" as const };
    const createdResponse = await POST(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "POST", body: JSON.stringify(evidenceFormToInput(initialForm)), headers: { "content-type": "application/json" } }), context(project.id));
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json() as { excerpt: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number] }).excerpt;

    const chapterForm = evidenceExcerptToForm(created); chapterForm.locatorType = "chapter"; chapterForm.page = ""; chapterForm.locator = "Chapter 3";
    const chapterResponse = await PATCH(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify(evidenceFormToInput(chapterForm)), headers: { "content-type": "application/json" } }), context(project.id));
    expect(chapterResponse.status).toBe(200);
    const chapter = (await chapterResponse.json() as { excerpt: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number]; verificationInvalidated?: boolean });
    expect(chapter).toMatchObject({ verificationInvalidated: true, excerpt: { locatorType: "chapter", locator: "Chapter 3", verificationStatus: "unverified" } });
    expect(chapter.excerpt.page).toBeUndefined(); expect(chapter.excerpt.reviewer).toBeUndefined(); expect(chapter.excerpt.reviewedAt).toBeUndefined();

    const reverifiedForm = evidenceExcerptToForm(chapter.excerpt); reverifiedForm.verificationStatus = "human_verified"; reverifiedForm.reviewer = "Alice"; reverifiedForm.reviewedAtLocal = "2026-08-20T02:00";
    const reverified = await PATCH(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify(evidenceFormToInput(reverifiedForm)), headers: { "content-type": "application/json" } }), context(project.id));
    expect(reverified.status).toBe(200);
    const current = (await reverified.json() as { excerpt: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number] }).excerpt;
    const claimForm = evidenceExcerptToForm(current); claimForm.claimId = "claim-a2";
    const claimChanged = await PATCH(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify(evidenceFormToInput(claimForm)), headers: { "content-type": "application/json" } }), context(project.id));
    expect((await claimChanged.json() as { excerpt: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number] }).excerpt.verificationStatus).toBe("unverified");

    const crossProject = await PATCH(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify({ id: created.id, claimId: "claim-b1" }), headers: { "content-type": "application/json" } }), context(project.id));
    expect(crossProject.status).toBeGreaterThanOrEqual(400);
    const afterRejected = (await listEvidenceExcerpts({ projectId: project.id, id: created.id }))[0]; expect(afterRejected.claimId).toBe("claim-a2");

    const switched = changeEvidenceWork(evidenceExcerptToForm(afterRejected), workB.id);
    expect(switched.fullTextAssetId).toBe("");
    switched.fullTextAssetId = assetB.id; switched.locatorType = "page"; switched.page = "15"; switched.locator = "";
    const saved = await PATCH(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify(evidenceFormToInput(switched)), headers: { "content-type": "application/json" } }), context(project.id));
    expect(saved.status).toBe(200);
    expect((await saved.json() as { excerpt: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number] }).excerpt).toMatchObject({ workId: workB.id, fullTextAssetId: assetB.id, locatorType: "page", page: "15" });
    expect((await listEvidenceExcerpts({ projectId: project.id, id: created.id }))[0]?.fullTextAssetId).not.toBe(assetA.id);
  });
});

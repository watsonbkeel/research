import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PATCH } from "@/app/api/projects/[projectId]/evidence-excerpts/route";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { createEvidenceExcerpt, listEvidenceExcerpts } from "@/lib/evidence-excerpts";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

describe("EvidenceExcerpt PATCH claim validation", () => {
  it("rejects missing and cross-project claims without changing the record", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "evidence-patch-claim-")); process.env.WORKBENCH_DATA_DIR = directory;
    const makeProject = async (idLabel: string) => {
      const project = createProject({ titleEn: `Claim validation ${idLabel}`, titleZh: `Claim ${idLabel}`, field: "Methods", context: "Fixture", institution: "University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
      const work = { id: `work-${idLabel}`, authors: "Author", year: 2026, title: `Work ${idLabel}`, venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "unverified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" };
      registerProjectWork(project.id, work);
      const workspace = await readWorkspace(project.id); workspace.works = [work]; workspace.claims = [{ id: `claim-${idLabel}`, text: `Claim ${idLabel}`, kind: "已发表事实", citationIds: [] }]; writeProjectState(project.id, "workspace", workspace);
      updateWorkVerification(project.id, work.id, { id: `verification-${idLabel}`, projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });
      return { project, work };
    };
    const a = await makeProject("a");
    const b = await makeProject("b");
    const excerpt = await createEvidenceExcerpt({ workId: a.work.id, locatorType: "page", page: "12", paraphrase: "Note", claimId: "claim-a" }, a.project.id);
    const patch = async (projectId: string, claimId: string) => PATCH(new Request(`http://localhost/api/projects/${projectId}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify({ id: excerpt.id, claimId }), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId }) });
    const missing = await patch(a.project.id, "claim-missing");
    expect(missing.status).toBeGreaterThanOrEqual(400);
    const crossProject = await patch(a.project.id, "claim-b");
    expect(crossProject.status).toBeGreaterThanOrEqual(400);
    expect((await listEvidenceExcerpts({ projectId: a.project.id, id: excerpt.id }))[0]?.claimId).toBe("claim-a");
    const valid = await patch(a.project.id, "claim-a");
    expect(valid.status).toBe(200);
  });
});

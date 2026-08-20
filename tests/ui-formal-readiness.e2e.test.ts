import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { institutionFormToProfile, institutionProfileToForm } from "@/lib/institution-form";
import { createEmptyEvidenceExcerptForm, evidenceExcerptToForm, evidenceFormToInput, validateEvidenceExcerptForm } from "@/lib/evidence-excerpt-form";
import { genericAustralianBaseline } from "@/lib/institution";
import { createProject, registerProjectWork, writeProjectState } from "@/lib/portfolio";
import { ensureProjectProposal, getDocumentVersion, getProjectDocument, saveProjectSection } from "@/lib/project-documents";
import { readWorkspace } from "@/lib/storage";
import { updateWorkVerification } from "@/lib/evidence-store";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { checkFormalExportGate } from "@/lib/formal-export-gate";
import { GET as getInstitution, PUT as putInstitution } from "@/app/api/projects/[projectId]/institution/route";
import { GET as getEvidence, PATCH as patchEvidence, POST as postEvidence } from "@/app/api/projects/[projectId]/evidence-excerpts/route";

let directory = "";
afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; directory = ""; });

function context(projectId: string) { return { params: Promise.resolve({ projectId }) }; }

describe("UI formal readiness adapters", () => {
  it("completes the UI-shaped project, evidence, version and formal-gate path", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "ui-formal-readiness-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "UI formal readiness project", titleZh: "UI 正式就绪项目", field: "Methods", context: "Controlled fixture", institution: "Verified University", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const document = ensureProjectProposal(project.id);
    const sections = document.manuscript.chapters.slice(0, 3).map((chapter) => chapter.sections[0]).filter((section): section is NonNullable<typeof section> => Boolean(section));
    expect(sections).toHaveLength(3);

    const institutionForm = institutionProfileToForm({ ...genericAustralianBaseline, id: "verified-ui-profile", university: "Verified University", faculty: "Research Faculty", school: "Research School", verificationStatus: "verified", verifiedBy: "staging reviewer", verifiedAt: "2026-08-20T00:00:00.000Z", requiredSections: [] });
    institutionForm.verifiedBy = "staging reviewer";
    institutionForm.verifiedAtLocal = "2026-08-20T08:00";
    institutionForm.requiredSections = sections.slice(0, 2).map((section) => ({ key: section.id, label: section.title, sectionId: section.id, sectionKey: section.id, aliasesText: section.title, required: true, minimumCharacters: "5" }));
    const institution = institutionFormToProfile(institutionForm);
    const putResponse = await putInstitution(new Request(`http://localhost/api/projects/${project.id}/institution`, { method: "PUT", body: JSON.stringify(institution), headers: { "content-type": "application/json" } }), context(project.id));
    expect(putResponse.status).toBe(200);
    const storedInstitution = await getInstitution(new Request(`http://localhost/api/projects/${project.id}/institution`), context(project.id));
    const storedProfile = await storedInstitution.json() as typeof institution;
    expect(storedProfile.requiredSections[0]).toMatchObject({ sectionId: sections[0].id, sectionKey: sections[0].id });
    expect(storedProfile.verifiedBy).toBe("staging reviewer");
    expect(storedProfile.verifiedAt).toBeDefined();

    saveProjectSection({ projectId: project.id, documentId: document.id, sectionId: sections[0].id, content: "A complete research context.", changeSummary: "UI fixture", editor: "researcher" });
    saveProjectSection({ projectId: project.id, documentId: document.id, sectionId: sections[1].id, content: "A complete significance section.", changeSummary: "UI fixture", editor: "researcher" });

    const work = { id: "work-ui-ready", authors: "Researcher", year: 2026, title: "UI evidence work", venue: "Journal", group: "方法来源" as const, status: "书目信息已核对" as const, bibliographicStatus: "unverified" as const, relevance: "Fixture", createdAt: "2026-08-20T00:00:00.000Z" };
    registerProjectWork(project.id, work);
    const workspace = await readWorkspace(project.id);
    workspace.works = [work];
    writeProjectState(project.id, "workspace", workspace);
    updateWorkVerification(project.id, work.id, { id: "verification-ui-ready", projectId: project.id, workId: work.id, provider: "manual", inputIdentifier: work.id, checkedAt: "2026-08-20T00:00:00.000Z", matchedFields: { doi: false, title: true, authors: true, year: true, venue: true }, result: "verified", retractionStatus: "clear" });

    const createTypedExcerpt = async (locatorType: "page" | "chapter" | "table", location: string) => {
      const form = { ...createEmptyEvidenceExcerptForm(work.id), locatorType, ...(locatorType === "page" ? { page: location } : { locator: location }), paraphrase: `UI ${locatorType} evidence` };
      const response = await postEvidence(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "POST", body: JSON.stringify(evidenceFormToInput(form)), headers: { "content-type": "application/json" } }), context(project.id));
      const body = await response.json() as { excerpt?: Awaited<ReturnType<typeof listEvidenceExcerpts>>[number]; error?: string };
      expect(response.status, body.error).toBe(201);
      return body.excerpt!;
    };
    const pageExcerpt = await createTypedExcerpt("page", "12");
    const chapterExcerpt = await createTypedExcerpt("chapter", "Chapter 3");
    const tableExcerpt = await createTypedExcerpt("table", "Table 2");
    expect(pageExcerpt.locatorType).toBe("page");
    expect(chapterExcerpt.locatorType).toBe("chapter");
    expect(tableExcerpt.locatorType).toBe("table");

    const existing = await listEvidenceExcerpts({ projectId: project.id });
    const legacy = { ...existing[0], id: "legacy-ui-untyped", page: undefined, locatorType: undefined, locator: "Methods", paraphrase: "Legacy locator", verificationStatus: "unverified" as const };
    writeProjectState(project.id, "evidence_excerpts", [...existing, legacy]);
    const legacyResponse = await getEvidence(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`), context(project.id));
    const legacyExcerpt = ((await legacyResponse.json()) as { excerpts: typeof existing }).excerpts.find((item) => item.id === legacy.id)!;
    const legacyForm = evidenceExcerptToForm(legacyExcerpt);
    expect(validateEvidenceExcerptForm(legacyForm).map((item) => item.field)).toContain("locatorType");
    legacyForm.locatorType = "section";
    legacyForm.locator = "Methods";
    const repaired = await patchEvidence(new Request(`http://localhost/api/projects/${project.id}/evidence-excerpts`, { method: "PATCH", body: JSON.stringify(evidenceFormToInput(legacyForm)), headers: { "content-type": "application/json" } }), context(project.id));
    expect(repaired.status).toBe(200);
    expect((await repaired.json()).excerpt).toMatchObject({ locatorType: "section", locator: "Methods" });

    const current = getProjectDocument(project.id, document.id)!;
    const version = getDocumentVersion(project.id, document.id, current.currentVersionId!)!;
    const gate = await checkFormalExportGate({ projectId: project.id, documentId: document.id, versionId: version.id });
    expect(gate).toHaveProperty("blockers");
    expect(gate.blockers.map((item) => item.code)).not.toContain("institution-required-section-empty");
    expect(gate.blockers.map((item) => item.code)).not.toContain("institution-profile-unverified");
    const otherProject = createProject({ titleEn: "UI isolation project", titleZh: "隔离项目", field: "Methods", context: "Other", institution: "Other", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const otherEvidence = await getEvidence(new Request(`http://localhost/api/projects/${otherProject.id}/evidence-excerpts`), context(otherProject.id));
    expect((await otherEvidence.json() as { excerpts: unknown[] }).excerpts).toEqual([]);
  });
});

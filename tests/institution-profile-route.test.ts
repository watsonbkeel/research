import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/portfolio";
import { GET, PUT } from "@/app/api/projects/[projectId]/institution/route";
import { genericAustralianBaseline } from "@/lib/institution";

let directory = "";
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
  delete process.env.WORKBENCH_DATA_DIR;
  directory = "";
});

describe("project institution route", () => {
  it("uses the path project id and preserves structured requiredSections", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "institution-route-"));
    process.env.WORKBENCH_DATA_DIR = directory;
    const projectA = createProject({ titleEn: "Project A", titleZh: "项目 A", field: "Field", context: "Context", institution: "A", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const projectB = createProject({ titleEn: "Project B", titleZh: "项目 B", field: "Field", context: "Context", institution: "B", primaryOutcome: "Outcome", secondaryOutcome: "Secondary" });
    const payload = {
      ...genericAustralianBaseline,
      id: "profile-a",
      university: "University A",
      requiredSections: [{ key: "abstract", label: "Abstract", sectionId: "a-abstract", sectionKey: "abstract", aliases: ["Summary"], required: true, minimumCharacters: 10 }],
    };
    const put = await PUT(new Request(`http://localhost/api/projects/${projectA.id}/institution?projectId=${projectB.id}`, { method: "PUT", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }), { params: Promise.resolve({ projectId: projectA.id }) });
    expect(put.status).toBe(200);
    expect(put.headers.get("x-affected-document-count")).not.toBeNull();
    const response = await GET(new Request(`http://localhost/api/projects/${projectA.id}/institution?projectId=${projectB.id}`), { params: Promise.resolve({ projectId: projectA.id }) });
    const saved = await response.json() as typeof payload;
    expect(saved.university).toBe("University A");
    expect(saved.requiredSections[0]).toMatchObject({ sectionId: "a-abstract", sectionKey: "abstract", aliases: ["Summary"], minimumCharacters: 10 });
    const other = await GET(new Request(`http://localhost/api/projects/${projectB.id}/institution`), { params: Promise.resolve({ projectId: projectB.id }) });
    expect((await other.json()).university).not.toBe("University A");
  });
});

import { mkdtempSync, rmSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { listDraftVersions, readManuscript, restoreDraftVersion, saveSectionDraft } from "@/lib/manuscript";

let temporaryDirectory = "";

describe("manuscript and DraftVersion persistence", () => {
  beforeAll(() => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "manuscript-"));
    process.env.WORKBENCH_DATA_DIR = temporaryDirectory;
  });

  afterAll(() => {
    delete process.env.WORKBENCH_DATA_DIR;
    rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  it("persists a section and restores a historical version", () => {
    const manuscript = readManuscript();
    const section = manuscript.chapters[0].sections[0];
    const first = saveSectionDraft({ manuscriptId: manuscript.id, sectionId: section.id, content: "First approved English draft.", changeSummary: "Initial researcher draft", editor: "researcher" });
    const second = saveSectionDraft({ manuscriptId: manuscript.id, sectionId: section.id, content: "Second English revision.", changeSummary: "Clarified research boundary", editor: "researcher" });
    expect(second.manuscript.chapters[0].sections[0].content).toBe("Second English revision.");
    expect(listDraftVersions(section.id)).toHaveLength(2);
    const restored = restoreDraftVersion(first.version.id);
    expect(restored.chapters[0].sections[0].content).toBe("First approved English draft.");
  });
});

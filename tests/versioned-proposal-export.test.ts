import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import {
  ensureProjectProposal,
  formalExportSnapshot,
  getDocumentVersion,
  saveProjectDocument,
} from "@/lib/project-documents";
import { closePortfolioDatabase, createProject } from "@/lib/portfolio";
import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import { readWorkspace, writeWorkspaceState } from "@/lib/storage";
import type { DocumentVersion, Work } from "@/lib/types";

let directory = "";

afterEach(() => {
  closePortfolioDatabase();
  if (directory) rmSync(directory, { recursive: true, force: true });
  delete process.env.WORKBENCH_DATA_DIR;
  directory = "";
});

async function documentXml(buffer: Buffer) {
  const archive = await JSZip.loadAsync(buffer);
  const xml = await archive.file("word/document.xml")?.async("string");
  if (!xml) throw new Error("DOCX is missing word/document.xml");
  return xml;
}

describe("versioned proposal export regressions", () => {
  it("renders a frozen GB/T proposal with Chinese references and stable cross-chapter numbering", async () => {
    directory = mkdtempSync(path.join(tmpdir(), "version-export-"));
    process.env.WORKBENCH_DATA_DIR = directory;

    const project = createProject({
      titleEn: "Frozen proposal export fixture",
      titleZh: "冻结开题导出测试",
      field: "Methods",
      context: "Fixture",
      institution: "Verified University",
      primaryOutcome: "Trust",
      secondaryOutcome: "Risk",
      citationStyle: "GB/T 7714",
    });
    const document = ensureProjectProposal(project.id);
    const works: Work[] = [
      {
        id: "internal-work-alpha",
        authors: "李明",
        year: 2024,
        title: "虚构透明度证据研究",
        venue: "虚构方法学刊",
        sourceType: "journal-article",
        group: "理论来源",
        status: "书目信息已核对",
        bibliographicStatus: "verified",
        retractionStatus: "clear",
        relevance: "fixture",
      },
      {
        id: "internal-work-beta",
        authors: "王琳",
        year: 2025,
        title: "虚构风险任务证据研究",
        venue: "虚构方法学刊",
        sourceType: "journal-article",
        group: "理论来源",
        status: "书目信息已核对",
        bibliographicStatus: "verified",
        retractionStatus: "clear",
        relevance: "fixture",
      },
    ];
    const workspace = await readWorkspace(project.id);
    workspace.works = works;
    writeWorkspaceState("workspace", workspace, project.id);

    const manuscript = structuredClone(document.manuscript);
    const first = manuscript.chapters[0].sections[0];
    const second = manuscript.chapters[1].sections[0];
    const third = manuscript.chapters[2].sections[0];
    first.content = "第一章事实 [[CITE:internal-work-alpha]]。";
    first.citationIds = [works[0].id];
    second.content = "第二章事实 [[CITE:internal-work-beta]]。";
    second.citationIds = [works[1].id];
    third.content = "第三章再次引用 [[CITE:internal-work-alpha]]。";
    third.citationIds = [works[0].id];
    const saved = saveProjectDocument(project.id, document.id, manuscript, {
      expectedVersion: document.currentVersionNumber,
      editor: "fixture researcher",
    });
    const version = getDocumentVersion(project.id, document.id, saved.currentVersionId!)!;
    expect(version.citationStyle).toBe("GB/T 7714");
    expect(version.citationClusters?.map((item) => item.documentOrder)).toEqual([1, 2, 3]);

    const exportFormal = exportConfirmationProposal as unknown as (input: {
      formal: true;
      version: DocumentVersion;
    }) => Promise<Buffer>;
    const firstXml = await documentXml(await exportFormal({ formal: true, version }));

    expect(firstXml).toContain("[1]");
    expect(firstXml).toContain("[2]");
    expect(firstXml).toContain("虚构透明度证据研究");
    expect(firstXml).toContain("虚构风险任务证据研究");
    expect(firstXml).not.toContain("[[CITE:");
    expect(firstXml).not.toContain("excerpt-");
    expect(firstXml).not.toContain("claim-");
    expect(firstXml).not.toContain("internal-work-alpha");
    expect(firstXml).not.toContain("internal-work-beta");
    expect(firstXml).not.toMatch(/\((?:李明|王琳),?\s*20(?:24|25)\)/u);

    const currentWorkspace = await readWorkspace(project.id);
    currentWorkspace.works[0].title = "当前工作区不应泄漏到旧版本";
    writeWorkspaceState("workspace", currentWorkspace, project.id);
    const frozen = formalExportSnapshot(project.id, document.id, version.id);
    const secondXml = await documentXml(
      await exportFormal({ formal: true, version: frozen.version }),
    );

    expect(secondXml).toBe(firstXml);
    expect(secondXml).not.toContain("当前工作区不应泄漏到旧版本");
  });
});

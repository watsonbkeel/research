import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "@/lib/portfolio";
import { importWork } from "@/lib/storage";
import { getFullTextPage, searchLocalFullText, storePdfAsset } from "@/lib/full-text";

const directories: string[] = [];
afterEach(() => { const directory = directories.pop(); if (directory) rmSync(directory, { recursive: true, force: true }); delete process.env.WORKBENCH_DATA_DIR; });

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

describe("project-scoped full text", () => {
  it("parses a user PDF by page and supports local search without external model use", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "full-text-test-")); directories.push(directory); process.env.WORKBENCH_DATA_DIR = directory;
    const project = createProject({ titleEn: "Full text project", titleZh: "全文项目", field: "Marketing", context: "Market", primaryOutcome: "Trust", secondaryOutcome: "Intention" });
    const workspace = await importWork({ title: "Local source", authors: "Doe, Jane", year: 2024, venue: "Journal", doi: "10.1000/local", relevance: "" }, project.id);
    const work = workspace.works.at(-1)!;
    const asset = await storePdfAsset({ projectId: project.id, workId: work.id, bytes: minimalPdf("Hello evidence") });
    expect(asset.status).toBe("parsed"); expect(asset.pageCount).toBe(1); expect(asset.externalModelUsePermission).toBe("prohibited");
    expect(searchLocalFullText(project.id, "evidence")[0]).toMatchObject({ workId: work.id, page: 1 });
    expect(getFullTextPage(project.id, asset.id, 1)?.text).toContain("Hello evidence");
  });
});

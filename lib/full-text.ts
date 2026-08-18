import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { portfolioDatabase } from "./portfolio";
import { ensureEvidenceSchema } from "./evidence-store";
import { readWorkspace } from "./storage";
import type { FullTextAsset } from "./types";

const now = () => new Date().toISOString();
const localRoot = () => process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), ".local");

export async function storePdfAsset(input: { projectId: string; workId: string; bytes: Uint8Array; source?: FullTextAsset["source"]; rightsStatus?: FullTextAsset["rightsStatus"]; externalModelUsePermission?: FullTextAsset["externalModelUsePermission"] }) {
  ensureEvidenceSchema();
  const workspace = await readWorkspace(input.projectId);
  if (!workspace.works.some((work) => work.id === input.workId)) throw new Error("Work不存在或不属于当前项目，不能绑定全文。");
  if (!input.bytes.byteLength) throw new Error("PDF文件为空。");
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  const id = `fulltext-${randomUUID()}`;
  const directory = path.join(localRoot(), "projects", input.projectId, "full-text"); mkdirSync(directory, { recursive: true, mode: 0o700 });
  const localPath = path.join(directory, `${id}.pdf`); writeFileSync(localPath, input.bytes, { mode: 0o600 });
  const asset: FullTextAsset = { id, projectId: input.projectId, workId: input.workId, source: input.source ?? "user_upload", localPath, checksum, mimeType: "application/pdf", status: "available", rightsStatus: input.rightsStatus ?? "unknown", externalModelUsePermission: input.externalModelUsePermission ?? "prohibited", createdAt: now(), updatedAt: now() };
  portfolioDatabase().prepare("INSERT INTO full_text_assets VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)").run(asset.id, asset.projectId, asset.workId, asset.source, asset.localPath ?? null, asset.checksum, asset.mimeType, null, asset.status, asset.rightsStatus, asset.externalModelUsePermission, asset.createdAt, asset.updatedAt);
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const document = await pdfjs.getDocument({ data: input.bytes }).promise;
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber); const content = await page.getTextContent();
      const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
      portfolioDatabase().prepare("INSERT INTO full_text_pages VALUES (?,?,?)").run(asset.id, pageNumber, text);
    }
    portfolioDatabase().prepare("UPDATE full_text_assets SET page_count=?,status='parsed',updated_at=? WHERE id=?").run(document.numPages, now(), asset.id);
    return { ...asset, pageCount: document.numPages, status: "parsed" as const };
  } catch (error) {
    portfolioDatabase().prepare("UPDATE full_text_assets SET status='parse_failed',updated_at=? WHERE id=?").run(now(), asset.id);
    throw new Error(`PDF解析失败：${error instanceof Error ? error.message : "未知错误"}`);
  }
}

export function listFullTextAssets(projectId: string) { ensureEvidenceSchema(); return portfolioDatabase().prepare("SELECT id,project_id AS projectId,work_id AS workId,source,local_path AS localPath,checksum,mime_type AS mimeType,page_count AS pageCount,status,rights_status AS rightsStatus,external_model_permission AS externalModelUsePermission,created_at AS createdAt,updated_at AS updatedAt FROM full_text_assets WHERE project_id=? ORDER BY created_at DESC").all(projectId) as unknown as FullTextAsset[]; }
export function getFullTextAsset(projectId: string, assetId: string) { ensureEvidenceSchema(); return portfolioDatabase().prepare("SELECT id,project_id AS projectId,work_id AS workId,source,local_path AS localPath,checksum,mime_type AS mimeType,page_count AS pageCount,status,rights_status AS rightsStatus,external_model_permission AS externalModelUsePermission,created_at AS createdAt,updated_at AS updatedAt FROM full_text_assets WHERE project_id=? AND id=?").get(projectId, assetId) as FullTextAsset | undefined; }
export function fullTextContainsQuote(projectId: string, assetId: string, quote: string) {
  ensureEvidenceSchema(); const normalizedQuote = quote.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  if (!normalizedQuote) return false;
  const pages = portfolioDatabase().prepare("SELECT p.text FROM full_text_pages p JOIN full_text_assets a ON a.id=p.asset_id WHERE a.project_id=? AND a.id=?").all(projectId, assetId) as Array<{ text: string }>;
  return pages.some((page) => page.text.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase().includes(normalizedQuote));
}
export function searchLocalFullText(projectId: string, query: string) { ensureEvidenceSchema(); const needle = query.trim().toLowerCase(); if (!needle) return []; return portfolioDatabase().prepare("SELECT a.id AS assetId,a.work_id AS workId,p.page_number AS page,p.text FROM full_text_pages p JOIN full_text_assets a ON a.id=p.asset_id WHERE a.project_id=? AND lower(p.text) LIKE ? ORDER BY a.created_at DESC,p.page_number").all(projectId, `%${needle}%`) as Array<{ assetId: string; workId: string; page: number; text: string }>; }
export function getFullTextPage(projectId: string, assetId: string, page: number) { ensureEvidenceSchema(); return portfolioDatabase().prepare("SELECT p.page_number AS page,p.text,a.work_id AS workId,a.external_model_permission AS externalModelUsePermission FROM full_text_pages p JOIN full_text_assets a ON a.id=p.asset_id WHERE a.project_id=? AND a.id=? AND p.page_number=?").get(projectId, assetId, page) as { page: number; text: string; workId: string; externalModelUsePermission: string } | undefined; }

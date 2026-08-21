"use client";

import { Pencil, Save, Trash2, X } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import type { FullTextAsset, WorkspaceData } from "@/lib/types";
import type { EvidenceExcerpt, EvidenceExcerptInput } from "@/lib/evidence-excerpts";
import {
  createEmptyEvidenceExcerptForm,
  evidenceExcerptToForm,
  evidenceFormToInput,
  changeEvidenceWork,
  validateEvidenceExcerptForm,
  type EvidenceExcerptForm,
} from "@/lib/evidence-excerpt-form";

export interface EvidenceExcerptEditorProps {
  data: WorkspaceData;
  assets: FullTextAsset[];
  initial?: EvidenceExcerpt;
  excerpts?: EvidenceExcerpt[];
  saving: boolean;
  onSave(input: EvidenceExcerptInput): Promise<void>;
  onCancelEdit?(): void;
  onEdit?(excerpt: EvidenceExcerpt): void;
  onDelete?(id: string): Promise<void>;
}

const locatorTypes = ["page", "chapter", "section", "paragraph", "figure", "table"] as const;
const locatorLabels: Record<(typeof locatorTypes)[number], string> = { page: "页码", chapter: "章节", section: "小节", paragraph: "段落", figure: "图", table: "表" };

function locationText(excerpt: EvidenceExcerpt) {
  if (!excerpt.locatorType && excerpt.locator) return `定位类型待确认：${excerpt.locator}`;
  if (excerpt.locatorType === "page") return `页码：${excerpt.page ?? excerpt.locator ?? "未填写"}`;
  if (excerpt.locatorType && excerpt.locator) return `${locatorLabels[excerpt.locatorType]}：${excerpt.locator}`;
  return "定位待补充";
}

export function EvidenceExcerptEditor({ data, assets, initial, excerpts = [], saving, onSave, onCancelEdit, onEdit, onDelete }: EvidenceExcerptEditorProps) {
  const [form, setForm] = useState<EvidenceExcerptForm>(() => initial ? evidenceExcerptToForm(initial) : createEmptyEvidenceExcerptForm(data.works[0]?.id));
  const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);
  const [workChanged, setWorkChanged] = useState(false);

  useEffect(() => {
    setForm(initial ? evidenceExcerptToForm(initial) : createEmptyEvidenceExcerptForm(data.works[0]?.id));
    setErrors([]);
    setWorkChanged(false);
  }, [data.works, initial]);

  function update(patch: Partial<EvidenceExcerptForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrors([]);
  }

  function changeLocatorType(value: EvidenceExcerptForm["locatorType"]) {
    if (value === "page") update({ locatorType: value, locator: "" });
    else update({ locatorType: value, page: "", locator: "" });
  }

  function changeWork(value: string) {
    setWorkChanged(form.workId !== value);
    setForm((current) => changeEvidenceWork(current, value));
    setErrors([]);
  }

  const availableAssets = assets.filter((asset) => (!data.project?.id || asset.projectId === data.project.id) && asset.workId === form.workId);
  useEffect(() => {
    if (!form.fullTextAssetId || availableAssets.some((asset) => asset.id === form.fullTextAssetId)) return;
    setForm((current) => ({ ...current, fullTextAssetId: "" }));
  }, [availableAssets, form.fullTextAssetId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateEvidenceExcerptForm(form);
    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }
    await onSave(evidenceFormToInput(form));
  }

  return <div className="evidence-excerpt-editor">
    <form className="evidence-form panel" onSubmit={submit}>
      <div className="panel-title"><div><h2>{initial ? "编辑 EvidenceExcerpt" : "创建 EvidenceExcerpt"}</h2><p>定位类型必须和定位值匹配；旧记录没有类型时请在这里补齐后 PATCH。</p></div></div>
      <div className="evidence-form-grid">
        <label><span>来源 Work</span><select value={form.workId} onChange={(event) => changeWork(event.target.value)}>{data.works.map((work) => <option key={work.id} value={work.id}>{work.id} · {work.title.slice(0, 60)}</option>)}</select></label>
        <label><span>全文资产</span><select value={form.fullTextAssetId} onChange={(event) => update({ fullTextAssetId: event.target.value })}><option value="">无（人工定位）</option>{availableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.id} · {asset.status}</option>)}</select></label>
        <label><span>Locator type</span><select value={form.locatorType ?? ""} onChange={(event) => changeLocatorType((event.target.value || undefined) as EvidenceExcerptForm["locatorType"])}><option value="">待确认</option>{locatorTypes.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        {form.locatorType === "page" ? <label><span>页码（page）</span><input value={form.page} onChange={(event) => update({ page: event.target.value })} placeholder="12、12–14 或 S3" /></label> : <label><span>定位（locator）</span><input value={form.locator} onChange={(event) => update({ locator: event.target.value })} placeholder={form.locatorType ? `${locatorLabels[form.locatorType]}定位，例如 Chapter 3` : "先选择定位类型"} /></label>}
        <label><span>Claim ID</span><input value={form.claimId} onChange={(event) => update({ claimId: event.target.value })} placeholder="claim-1" /></label>
        <label><span>支持方向</span><select value={form.supportDirection} onChange={(event) => update({ supportDirection: event.target.value as EvidenceExcerptForm["supportDirection"] })}><option value="supporting">supporting</option><option value="contradicting">contradicting</option><option value="mixed">mixed</option><option value="context-only">context-only</option></select></label>
        <label><span>Strength</span><select value={form.strength} onChange={(event) => update({ strength: event.target.value as EvidenceExcerptForm["strength"] })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        <label><span>Relevance</span><select value={form.relevance} onChange={(event) => update({ relevance: event.target.value as EvidenceExcerptForm["relevance"] })}><option value="low">low</option><option value="medium">medium</option><option value="high">high</option></select></label>
        <label><span>Verification status</span><select value={form.verificationStatus} onChange={(event) => update({ verificationStatus: event.target.value as EvidenceExcerptForm["verificationStatus"] })}><option value="unverified">unverified</option><option value="ai_suggested">ai_suggested</option><option value="human_verified">human_verified</option><option value="rejected">rejected</option></select></label>
        <label><span>核验者</span><input value={form.reviewer} onChange={(event) => update({ reviewer: event.target.value })} /></label>
        <label><span>核验时间</span><input type="datetime-local" value={form.reviewedAtLocal} onChange={(event) => update({ reviewedAtLocal: event.target.value })} /></label>
        <label><span>External model permission</span><select value={form.externalModelUsePermission} onChange={(event) => update({ externalModelUsePermission: event.target.value as EvidenceExcerptForm["externalModelUsePermission"] })}><option value="prohibited">prohibited</option><option value="allowed">allowed</option><option value="unknown">unknown</option></select></label>
        <label><span>Export permission</span><select value={form.exportPermission} onChange={(event) => update({ exportPermission: event.target.value as EvidenceExcerptForm["exportPermission"] })}><option value="allowed">allowed</option><option value="prohibited">prohibited</option><option value="unknown">unknown</option></select></label>
        <label className="full"><span>原文短引文（可选）</span><textarea value={form.quote} onChange={(event) => update({ quote: event.target.value })} maxLength={2000} /></label>
        <label className="full"><span>研究者释义</span><textarea value={form.paraphrase} onChange={(event) => update({ paraphrase: event.target.value })} maxLength={5000} /></label>
      </div>
      {workChanged && <p className="form-hint">已清除旧全文文件，请重新选择与新文献对应的 PDF；更换文献会使当前人工核验失效。</p>}
      {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={`${error.field}-${error.message}`}>{error.field}: {error.message}</p>)}</div>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={saving}><Save size={15} />{saving ? "保存中" : initial ? "更新摘录" : "保存摘录"}</button>{initial && onCancelEdit && <button className="button secondary" type="button" onClick={onCancelEdit}><X size={15} />取消编辑</button>}</div>
    </form>
    <div className="table-shell evidence-table"><table><thead><tr><th>来源 / 定位</th><th>Claim</th><th>内容</th><th>核验状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{excerpts.map((excerpt) => <tr key={excerpt.id}><td><strong>{excerpt.workId}</strong><span>{locationText(excerpt)}</span></td><td>{excerpt.claimId ?? "未绑定"}</td><td className="excerpt-copy">{excerpt.paraphrase ?? excerpt.quote ?? ""}</td><td><span className={`status ${excerpt.verificationStatus === "human_verified" ? "positive" : "warning"}`}>{excerpt.verificationStatus}</span>{excerpt.reviewer && <small>{excerpt.reviewer}</small>}{excerpt.reviewedAt && <small>{new Date(excerpt.reviewedAt).toLocaleString("zh-CN")}</small>}</td><td><button className="icon-button" type="button" onClick={() => onEdit?.(excerpt)} aria-label="编辑" title="编辑"><Pencil size={15} /></button>{onDelete && <button className="icon-button danger" type="button" onClick={() => void onDelete(excerpt.id)} aria-label="删除" title="删除"><Trash2 size={15} /></button>}</td></tr>)}{excerpts.length === 0 && <tr><td colSpan={5}><div className="empty-review">尚无摘录。创建第一条带明确定位类型的证据。</div></td></tr>}</tbody></table></div>
  </div>;
}

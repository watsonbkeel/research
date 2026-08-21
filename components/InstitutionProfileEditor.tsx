"use client";

import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import React from "react";
import { useEffect, useState } from "react";
import type { InstitutionProfile } from "@/lib/institution";
import {
  createRequiredSectionForm,
  institutionFormToProfile,
  institutionProfileToForm,
  type InstitutionProfileForm,
  type InstitutionRequiredSectionForm,
  validateInstitutionForm,
} from "@/lib/institution-form";

interface AvailableSection {
  id: string;
  number: string;
  title: string;
}

export interface InstitutionProfileEditorProps {
  profile: InstitutionProfile;
  availableSections: AvailableSection[];
  saving: boolean;
  onSave(profile: InstitutionProfile): Promise<void>;
}

const verificationStatuses: InstitutionProfile["verificationStatus"][] = [
  "generic-baseline",
  "pending-verification",
  "unverified",
  "draft",
  "imported",
  "requires_review",
  "unknown",
  "verified",
];

export function InstitutionProfileEditor({ profile, availableSections, saving, onSave }: InstitutionProfileEditorProps) {
  const [form, setForm] = useState<InstitutionProfileForm>(() => institutionProfileToForm(profile));
  const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);

  useEffect(() => setForm(institutionProfileToForm(profile)), [profile]);

  function update(patch: Partial<InstitutionProfileForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrors([]);
  }

  function updateRequiredSection(index: number, patch: Partial<InstitutionRequiredSectionForm>) {
    update({ requiredSections: form.requiredSections.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row) });
  }

  function addRequiredSection() {
    update({ requiredSections: [...form.requiredSections, createRequiredSectionForm(form.requiredSections)] });
  }

  function moveRequiredSection(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= form.requiredSections.length) return;
    const next = [...form.requiredSections];
    [next[index], next[target]] = [next[target], next[index]];
    update({ requiredSections: next });
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateInstitutionForm(form);
    if (nextErrors.length) {
      setErrors(nextErrors);
      return;
    }
    await onSave(institutionFormToProfile(form));
  }

  const errorFor = (field: string) => errors.find((item) => item.field === field)?.message;
  const inputClass = (field: string) => errorFor(field) ? "form-invalid" : undefined;

  return (
    <form className="institution-profile-editor" onSubmit={submit}>
      <div className="institution-editor-section">
        <div className="editor-section-heading"><div><h3>基本信息</h3><p>院校、学院、项目和 milestone 分开保存，供版本快照使用。</p></div></div>
        <div className="institution-fields">
          <label><span>University</span><input className={inputClass("university")} value={form.university} onChange={(event) => update({ university: event.target.value })} /></label>
          <label><span>Faculty</span><input value={form.faculty} onChange={(event) => update({ faculty: event.target.value })} /></label>
          <label><span>School</span><input value={form.school} onChange={(event) => update({ school: event.target.value })} /></label>
          <label><span>Program</span><input className={inputClass("program")} value={form.program} onChange={(event) => update({ program: event.target.value })} /></label>
          <label><span>Milestone name</span><input value={form.milestoneName} onChange={(event) => update({ milestoneName: event.target.value })} /></label>
          <label><span>Word limit</span><input type="number" min="0" value={form.wordLimit} onChange={(event) => update({ wordLimit: event.target.value })} /></label>
          <label><span>Page limit</span><input type="number" min="0" value={form.pageLimit} onChange={(event) => update({ pageLimit: event.target.value })} /></label>
          <label><span>Official URL</span><input type="url" value={form.officialUrl} onChange={(event) => update({ officialUrl: event.target.value })} /></label>
          <label><span>Official source access date</span><input type="date" value={form.accessDate} onChange={(event) => update({ accessDate: event.target.value })} /></label>
        </div>
      </div>

      <div className="institution-editor-section">
        <div className="editor-section-heading"><div><h3>核验信息</h3><p>verified 模板必须同时记录核验者和核验时间；其他状态不会被 FormalExportGate 视为已核验。</p></div></div>
        <div className="institution-fields">
          <label><span>Verification status</span><select value={form.verificationStatus} onChange={(event) => update({ verificationStatus: event.target.value as InstitutionProfile["verificationStatus"] })}>{verificationStatuses.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
          <label><span>Verified by</span><input className={inputClass("verifiedBy")} value={form.verifiedBy} onChange={(event) => update({ verifiedBy: event.target.value })} /></label>
          <label><span>Verified at</span><input className={inputClass("verifiedAtLocal")} type="datetime-local" value={form.verifiedAtLocal} onChange={(event) => update({ verifiedAtLocal: event.target.value })} /></label>
          <label className="full"><span>Source note</span><textarea value={form.sourceNote} onChange={(event) => update({ sourceNote: event.target.value })} /></label>
          <label className="full"><span>Notes</span><textarea value={form.notes} onChange={(event) => update({ notes: event.target.value })} /></label>
        </div>
        {form.verificationStatus !== "verified" && <p className="form-hint">当前状态不会被 FormalExportGate 视为已核验；填写的核验信息会保留。</p>}
      </div>

      <div className="institution-editor-section">
        <div className="editor-section-heading"><div><h3>正式要求</h3><p>每项要求独立保存，避免把不同规则混在一段文本中。</p></div></div>
        <div className="institution-fields">
          <label className="full"><span>Oral presentation requirements</span><textarea value={form.oralPresentationRequirements} onChange={(event) => update({ oralPresentationRequirements: event.target.value })} /></label>
          <label className="full"><span>Panel composition</span><textarea value={form.panelComposition} onChange={(event) => update({ panelComposition: event.target.value })} /></label>
          <label className="full"><span>Ethics prerequisites</span><textarea value={form.ethicsPrerequisites} onChange={(event) => update({ ethicsPrerequisites: event.target.value })} /></label>
          <label className="full"><span>Data management requirements</span><textarea value={form.dataManagementRequirements} onChange={(event) => update({ dataManagementRequirements: event.target.value })} /></label>
          <label className="full"><span>AI use requirements</span><textarea value={form.aiUseRequirements} onChange={(event) => update({ aiUseRequirements: event.target.value })} /></label>
          <label className="full"><span>Formatting requirements</span><textarea value={form.formattingRequirements} onChange={(event) => update({ formattingRequirements: event.target.value })} /></label>
        </div>
      </div>

      <div className="institution-editor-section">
        <div className="editor-section-heading"><div><h3>结构化必填章节</h3><p>优先 sectionId，其次 sectionKey，最后使用 label / aliases 的标准化精确匹配；不会使用模糊相似度。</p>{availableSections.length === 0 && <p className="form-hint">项目中没有 Confirmation Proposal，sectionId 映射暂不可用；现有映射会保留，切换到开题文档后再编辑。</p>}</div><button className="button secondary" type="button" onClick={addRequiredSection}><Plus size={15} />添加必填项</button></div>
        <div className="required-sections-list">
          {form.requiredSections.map((row, index) => {
            const rowPrefix = `requiredSections.${index}`;
            return <article className="required-section-row" key={`${row.key}-${index}`}>
              <div className="required-section-row-fields">
                <label><span>Key</span><input value={row.key} onChange={(event) => updateRequiredSection(index, { key: event.target.value })} /></label>
                <label><span>Label</span><input className={inputClass(`${rowPrefix}.label`)} value={row.label} onChange={(event) => updateRequiredSection(index, { label: event.target.value })} /></label>
                <label className="check-inline"><input type="checkbox" checked={row.required} onChange={(event) => updateRequiredSection(index, { required: event.target.checked })} /><span>Required</span></label>
                <label><span>Mapped manuscript section</span><select disabled={availableSections.length === 0} value={row.sectionId} onChange={(event) => updateRequiredSection(index, { sectionId: event.target.value })}><option value="">{availableSections.length === 0 ? "无 Confirmation Proposal" : "不指定"}</option>{row.sectionId && !availableSections.some((section) => section.id === row.sectionId) && <option value={row.sectionId}>{row.sectionId}（当前映射）</option>}{availableSections.map((section) => <option key={section.id} value={section.id}>{section.number} {section.title}</option>)}</select></label>
                <label><span>Section key</span><input value={row.sectionKey} onChange={(event) => updateRequiredSection(index, { sectionKey: event.target.value })} /></label>
                <label><span>Aliases</span><textarea value={row.aliasesText} onChange={(event) => updateRequiredSection(index, { aliasesText: event.target.value })} placeholder="每行一个精确别名" /></label>
                <label><span>Minimum characters</span><input type="number" min="0" value={row.minimumCharacters} onChange={(event) => updateRequiredSection(index, { minimumCharacters: event.target.value })} /></label>
              </div>
              <div className="required-section-row-actions">
                <button className="icon-button" type="button" onClick={() => moveRequiredSection(index, -1)} disabled={index === 0} aria-label="上移" title="上移"><ArrowUp size={15} /></button>
                <button className="icon-button" type="button" onClick={() => moveRequiredSection(index, 1)} disabled={index === form.requiredSections.length - 1} aria-label="下移" title="下移"><ArrowDown size={15} /></button>
                <button className="icon-button danger" type="button" onClick={() => update({ requiredSections: form.requiredSections.filter((_, rowIndex) => rowIndex !== index) })} aria-label="删除" title="删除"><Trash2 size={15} /></button>
              </div>
            </article>;
          })}
          {form.requiredSections.length === 0 && <p className="empty-review">尚未添加必填章节。保存前请确认模板确实没有必填项。</p>}
        </div>
      </div>

      {errors.length > 0 && <div className="form-errors" role="alert">{errors.map((error) => <p key={`${error.field}-${error.message}`}>{error.field}: {error.message}</p>)}</div>}
      <div className="form-actions"><button className="button primary" type="submit" disabled={saving}><Save size={15} />{saving ? "保存中" : "保存院校模板"}</button></div>
    </form>
  );
}

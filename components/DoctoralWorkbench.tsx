"use client";

import {
  BookOpen,
  FileOutput,
  History,
  Lock,
  Network,
  Plus,
  Quote,
  Search,
  Save,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Upload,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { FullTextAsset, WorkspaceData } from "@/lib/types";
import type { EvidenceExcerpt } from "@/lib/evidence-excerpts";
import type { InstitutionProfile } from "@/lib/institution";
import type { AnalysisPlan, Hypothesis, ResearchPlanState } from "@/lib/research-plan";
import type { AnalysisRun } from "@/lib/results";
import type { DraftVersion, Manuscript, ManuscriptSection } from "@/lib/manuscript";
import type { DatasetRegistry } from "@/lib/datasets";
import type { PaperConcept, ProjectDocument } from "@/lib/project-documents";

export type DoctoralView = "manuscript" | "evidence-excerpts" | "research-plan" | "results" | "outputs" | "review" | "materials" | "figures";

const documentTypeLabels: Record<Manuscript["documentType"], string> = {
  "research-evidence-pack": "Research Evidence Pack",
  "confirmation-proposal": "Confirmation Proposal",
  "ethics-preregistration-pack": "Ethics / Preregistration Pack",
  "study-report": "Study Report",
  "journal-article": "Journal Article",
  "doctoral-thesis": "Doctoral Thesis",
};

function apiError(result: unknown, fallback: string) {
  return result && typeof result === "object" && "error" in result && typeof result.error === "string" ? result.error : fallback;
}

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

export function ManuscriptCenter({ notify, projectId }: { notify: (message: string) => void; projectId: string }) {
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [concepts, setConcepts] = useState<PaperConcept[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [versions, setVersions] = useState<DraftVersion[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [institution, setInstitution] = useState<InstitutionProfile | null>(null);
  const [auditStatus, setAuditStatus] = useState<{ blockers: number; warnings: number; consistency?: string }>({ blockers: 0, warnings: 0 });
  const [coverageStatus, setCoverageStatus] = useState<{ total: number; unsupported: number; unclassified: number }>({ total: 0, unsupported: 0, unclassified: 0 });
  const [formalGateBlocked, setFormalGateBlocked] = useState(true);

  useEffect(() => {
    void Promise.all([fetch(`/api/projects/${encodeURIComponent(projectId)}/documents`), fetch(`/api/institution?projectId=${encodeURIComponent(projectId)}`)]).then(async ([manuscriptResponse, institutionResponse]) => {
      const documentResult = await manuscriptResponse.json() as { documents?: ProjectDocument[] };
      const institutionResult = await institutionResponse.json() as { university?: string; wordLimit?: number | null; verificationStatus?: string };
      const firstDocument = documentResult.documents?.[0];
      setDocuments(documentResult.documents ?? []);
      setDocumentId(firstDocument?.id ?? "");
      setManuscript(firstDocument?.manuscript ?? null);
      const firstSection = firstDocument?.manuscript.chapters[0]?.sections[0];
      if (firstSection) setSelectedId(firstSection.id);
      setInstitution(institutionResult as InstitutionProfile);
      setLoading(false);
    }).catch(() => { notify("稿件中心加载失败"); setLoading(false); });
  }, [notify, projectId]);

  useEffect(() => { void fetch(`/api/projects/${encodeURIComponent(projectId)}/paper-concepts`).then((response) => response.json()).then((result: { concepts?: PaperConcept[] }) => setConcepts(result.concepts ?? [])).catch(() => undefined); }, [projectId]);

  function selectDocument(id: string) {
    const next = documents.find((item) => item.id === id); if (!next) return;
    setDocumentId(id); setManuscript(next.manuscript); setSelectedId(next.manuscript.chapters[0]?.sections[0]?.id ?? ""); setVersions([]); setFormalGateBlocked(true);
  }

  async function createArticle() {
    const title = window.prompt("输入期刊论文标题"); if (!title?.trim()) return;
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: title.trim() }) });
    const result = await response.json() as { document?: ProjectDocument; error?: string };
    if (!response.ok || !result.document) return notify(apiError(result, "论文创建失败"));
    setDocuments((current) => [...current, result.document!]); selectDocument(result.document.id); setDocumentId(result.document.id); setManuscript(result.document.manuscript); setSelectedId(result.document.manuscript.chapters[0]?.sections[0]?.id ?? ""); notify("期刊论文预测稿已创建");
  }

  async function suggestConcepts() {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/paper-concepts/suggest`, { method: "POST" }); const result = await response.json() as { concepts?: PaperConcept[]; error?: string };
    if (!response.ok) return notify(apiError(result, "论文组合建议失败")); setConcepts(result.concepts ?? []); notify("论文组合建议已生成，请人工确认重叠与贡献边界");
  }

  async function confirmConcept(conceptId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/paper-concepts/${encodeURIComponent(conceptId)}/confirm`, { method: "POST" }); const result = await response.json() as { document?: ProjectDocument; error?: string };
    if (!response.ok || !result.document) return notify(apiError(result, "论文建议确认失败")); setDocuments((current) => current.some((item) => item.id === result.document!.id) ? current : [...current, result.document!]); setConcepts((current) => current.map((item) => item.id === conceptId ? { ...item, status: "confirmed" } : item)); notify("论文文档已创建");
  }

  async function activateEmpiricalMode() {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "empirical" }) }); const result = await response.json() as { document?: ProjectDocument; error?: string };
    if (!response.ok || !result.document) return notify(apiError(result, "尚不能转为实证稿")); setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item)); setManuscript(result.document.manuscript); notify("真实分析门控已通过，文档已转为 empirical 模式");
  }

  const selected = useMemo(() => manuscript?.chapters.flatMap((chapter) => chapter.sections).find((section) => section.id === selectedId), [manuscript, selectedId]);
  const currentDocument = documents.find((item) => item.id === documentId);
  const currentVersionId = currentDocument?.currentVersionId;
  const formalExportUrl = currentVersionId
    ? `/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/export?format=docx&formal=1&versionId=${encodeURIComponent(currentVersionId)}`
    : undefined;

  function updateSection(patch: Partial<ManuscriptSection>) {
    if (!selected || !manuscript) return;
    setManuscript({ ...manuscript, chapters: manuscript.chapters.map((chapter) => ({ ...chapter, sections: chapter.sections.map((section) => section.id === selected.id ? { ...section, ...patch } : section) })) });
    setFormalGateBlocked(true);
  }

  async function saveSection(event?: FormEvent) {
    event?.preventDefault();
    if (!manuscript || !selected) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ sectionId: selected.id, content: selected.content, changeSummary: "Researcher saved section draft", editor: "researcher", expectedVersion: currentDocument?.currentVersionNumber }) });
    const result = await response.json() as { document?: ProjectDocument; version?: DraftVersion; error?: string };
    setSaving(false);
    if (!response.ok || !result.document) return notify(apiError(result, "章节保存失败"));
    setManuscript(result.document.manuscript); setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item));
    setFormalGateBlocked(true);
    await loadVersions(selected.id);
    notify("章节和DraftVersion已保存");
  }

  async function saveMetadata() {
    if (!manuscript) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ manuscript }) });
    const result = await response.json() as { document?: ProjectDocument; error?: string };
    setSaving(false);
    if (!response.ok || !result.document) return notify(apiError(result, "稿件元数据保存失败"));
    setManuscript(result.document.manuscript); setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item));
    setFormalGateBlocked(true);
    notify("稿件元数据已保存");
  }

  async function generateSection() {
    if (!selected) return;
    setGenerating(true);
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sectionId: selected.id, editor: "researcher" }) });
    const result = await response.json() as { document?: ProjectDocument; version?: DraftVersion; error?: string };
    setGenerating(false);
    if (!response.ok || !result.document) return notify(apiError(result, "分层稿件生成失败"));
    setManuscript(result.document.manuscript); setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item));
    setFormalGateBlocked(true);
    await loadVersions(selected.id);
    notify("分层英文草稿已生成；证据、逻辑和导师审核仍未完成");
  }

  async function runReview(type: "citation" | "consistency" | "coverage" | "formal-export-gate") {
    if (!currentVersionId) return notify("当前文档没有可审查的不可变版本。");
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/audits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, formal: true, versionId: currentVersionId }) });
    const result = await response.json() as { status?: string; allowed?: boolean; blockers?: unknown[]; warnings?: unknown[]; paragraphs?: Array<{ sentences: Array<{ coverageStatus: string }> }>; error?: string };
    if (!response.ok) return notify(apiError(result, "审查失败"));
    if (type === "citation") setAuditStatus((current) => ({ ...current, blockers: result.blockers?.length ?? 0, warnings: result.warnings?.length ?? 0 }));
    else if (type === "consistency") setAuditStatus((current) => ({ ...current, consistency: result.status }));
    else if (type === "coverage") { const sentences = result.paragraphs?.flatMap((paragraph) => paragraph.sentences) ?? []; setCoverageStatus({ total: sentences.length, unsupported: sentences.filter((item) => item.coverageStatus === "unsupported").length, unclassified: sentences.filter((item) => item.coverageStatus === "unclassified").length }); }
    else setFormalGateBlocked(result.allowed !== true);
    notify(type === "formal-export-gate" ? `正式导出质量门：${result.allowed ? "通过" : `${result.blockers?.length ?? 0} 个 blocker`}` : `${type} 审查已运行`);
  }

  async function setEvidenceMode(evidenceMode: ProjectDocument["evidenceMode"]) { const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ evidenceMode }) }); const result = await response.json() as { document?: ProjectDocument; error?: string }; if (!response.ok || !result.document) return notify(apiError(result, "证据模式更新失败")); setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item)); setFormalGateBlocked(true); }

  async function saveInstitution() {
    if (!institution) return;
    const response = await fetch(`/api/institution?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(institution) });
    const result = await response.json() as InstitutionProfile & { error?: string };
    if (!response.ok) return notify(apiError(result, "院校配置保存失败"));
    setInstitution(result);
    setFormalGateBlocked(true);
    notify("院校模板配置已保存");
  }

  async function loadVersions(sectionId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions?sectionId=${encodeURIComponent(sectionId)}`);
    const result = await response.json() as { versions?: DraftVersion[] };
    setVersions(result.versions ?? []);
  }

  async function restore(versionId: string) {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/versions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId }) });
    const result = await response.json() as { document?: ProjectDocument; error?: string };
    if (!response.ok || !result.document) return notify(apiError(result, "版本恢复失败"));
    setManuscript(result.document.manuscript);
    setDocuments((current) => current.map((item) => item.id === documentId ? result.document! : item));
    setFormalGateBlocked(true);
    notify("已恢复版本；请再次保存以形成新的审阅记录");
  }

  if (loading) return <div className="page-content"><div className="empty-draft">正在加载稿件中心…</div></div>;
  if (!manuscript) return <div className="page-content"><div className="notice"><strong>稿件未初始化</strong><p>无法读取持久化稿件对象。</p></div></div>;

  return (
    <div className="page-content doctoral-page manuscript-page">
      <header className="section-header">
        <p className="eyebrow">Manuscript centre</p>
        <h1>稿件中心</h1>
        <p>每个项目可拥有一份开题和多篇独立论文；每次保存都会生成可恢复的 DraftVersion。没有真实数据的论文保持 prospective 标识。</p>
      </header>
      <section className="panel paper-concept-panel"><div className="panel-title"><Sparkles size={17}/><div><h2>论文组合建议</h2><p>按 Study 和假设拆分，确认后才创建稿件。</p></div></div>{concepts.length === 0 ? <button className="button secondary" type="button" onClick={() => void suggestConcepts()}>生成 2–3 篇论文建议</button> : <div className="paper-concept-list">{concepts.map((concept) => <div key={concept.id}><div><strong>{concept.title}</strong><span>{concept.centralQuestion}</span>{concept.overlapWarning && <small>{concept.overlapWarning}</small>}</div>{concept.status === "confirmed" ? <span className="status positive">已创建</span> : <button className="button secondary" type="button" onClick={() => void confirmConcept(concept.id)}>确认创建</button>}</div>)}</div>}</section>
      <section className="panel document-switcher"><label><span>当前文档</span><select value={documentId} onChange={(event) => selectDocument(event.target.value)}>{documents.map((document) => <option key={document.id} value={document.id}>{document.documentType === "confirmation-proposal" ? "开题" : "论文"} · {document.title}</option>)}</select></label><div><span className={`status ${currentDocument?.researchMode === "prospective" ? "warning" : "positive"}`}>研究 {currentDocument?.researchMode ?? "prospective"}</span><button className="button secondary" type="button" onClick={() => void setEvidenceMode(currentDocument?.evidenceMode === "formal" ? "exploratory" : "formal")}>证据 {currentDocument?.evidenceMode ?? "exploratory"}</button><span className="status">全局版本 {currentDocument?.currentVersionNumber ?? 0}</span><span className="status">正式导出版本：{currentVersionId ?? "无"}</span><span className={`status ${auditStatus.blockers ? "warning" : "positive"}`}>audit {auditStatus.blockers}/{auditStatus.warnings}</span><span className={`status ${coverageStatus.unsupported + coverageStatus.unclassified ? "warning" : "positive"}`}>coverage {coverageStatus.total - coverageStatus.unsupported - coverageStatus.unclassified}/{coverageStatus.total}</span>{currentDocument?.documentType === "journal-article" && currentDocument?.researchMode === "prospective" && <button className="button secondary" type="button" onClick={() => void activateEmpiricalMode()}>转为实证稿</button>}<button className="button secondary" type="button" onClick={() => void runReview("coverage")}>论断覆盖</button><button className="button secondary" type="button" onClick={() => void runReview("citation")}><ShieldCheck size={14}/>引用审查</button><button className="button secondary" type="button" onClick={() => void runReview("consistency")}><Network size={14}/>一致性审查</button><button className="button secondary" type="button" disabled={!currentVersionId} onClick={() => void runReview("formal-export-gate")}>检查正式导出</button><a className="button secondary" href={`/api/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}/export?format=docx`}><FileOutput size={14}/>草稿 DOCX</a><a className={`button primary ${formalGateBlocked || !currentVersionId ? "disabled" : ""}`} aria-disabled={formalGateBlocked || !currentVersionId} href={formalGateBlocked ? undefined : formalExportUrl}>正式 DOCX</a><button className="button primary" type="button" onClick={() => void createArticle()}><Plus size={14}/>新建论文</button></div></section>
      <section className="manuscript-meta panel">
        <div className="manuscript-meta-grid">
          <label><span>输出层级</span><select value={manuscript.documentType} disabled>{Object.entries(documentTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>目标院校</span><input value={manuscript.targetUniversity} onChange={(event) => setManuscript({ ...manuscript, targetUniversity: event.target.value })} /></label>
          <label><span>稿件版本</span><input value={manuscript.version} onChange={(event) => setManuscript({ ...manuscript, version: event.target.value })} /></label>
          <label><span>稿件状态</span><select value={manuscript.status} onChange={(event) => setManuscript({ ...manuscript, status: event.target.value as Manuscript["status"] })}><option value="draft">draft</option><option value="evidence-checked">evidence-checked</option><option value="methods-checked">methods-checked</option><option value="supervisor-reviewed">supervisor-reviewed</option><option value="approved">approved</option></select></label>
        </div>
        <div className="manuscript-meta-actions"><span className={institution?.verificationStatus === "verified" ? "quality-ok" : "quality-warning"}>{institution?.university ?? "院校配置加载中"} · {institution?.verificationStatus === "verified" ? "官方要求已核验" : "通用澳洲基线，尚未指定院校"}</span><button className="button secondary" type="button" onClick={() => void saveMetadata()} disabled={saving}><Save size={15} />保存稿件设置</button></div>
      </section>
      {institution && <section className="institution-settings panel"><div className="panel-title"><BookOpen size={17} /><div><h2>目标大学模板</h2><p>未核验官方来源前，只能作为 generic Australian baseline。</p></div></div><div className="institution-fields"><label><span>University</span><input value={institution.university} onChange={(event) => setInstitution({ ...institution, university: event.target.value })} /></label><label><span>Faculty / School</span><input value={`${institution.faculty}${institution.school ? ` / ${institution.school}` : ""}`} onChange={(event) => setInstitution({ ...institution, faculty: event.target.value, school: "" })} /></label><label><span>Program</span><input value={institution.program} onChange={(event) => setInstitution({ ...institution, program: event.target.value })} /></label><label><span>Milestone</span><input value={institution.milestoneName} onChange={(event) => setInstitution({ ...institution, milestoneName: event.target.value })} /></label><label><span>Word limit</span><input type="number" min="0" value={institution.wordLimit ?? ""} onChange={(event) => setInstitution({ ...institution, wordLimit: event.target.value ? Number(event.target.value) : null })} /></label><label><span>Official URL</span><input type="url" value={institution.officialUrl} onChange={(event) => setInstitution({ ...institution, officialUrl: event.target.value })} /></label><label><span>Verification status</span><select value={institution.verificationStatus} onChange={(event) => setInstitution({ ...institution, verificationStatus: event.target.value as InstitutionProfile["verificationStatus"] })}><option value="generic-baseline">generic-baseline</option><option value="pending-verification">pending-verification</option><option value="verified">verified</option></select></label><label className="full"><span>Required sections（每行一项）</span><textarea value={institution.requiredSections.join("\n")} onChange={(event) => setInstitution({ ...institution, requiredSections: event.target.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) })} /></label><label className="full"><span>Ethics / AI / formatting requirements</span><textarea value={`${institution.ethicsPrerequisites}\n${institution.aiUseRequirements}\n${institution.formattingRequirements}`} onChange={(event) => { const [ethicsPrerequisites = "", aiUseRequirements = "", formattingRequirements = ""] = event.target.value.split(/\r?\n/); setInstitution({ ...institution, ethicsPrerequisites, aiUseRequirements, formattingRequirements }); }} /></label></div><div className="form-actions"><button className="button secondary" type="button" onClick={() => void saveInstitution()}><Save size={15} />保存院校模板</button></div></section>}
      <div className="manuscript-layout">
        <aside className="chapter-tree" aria-label="章节树">
          <div className="tree-heading"><strong>Proposal outline</strong><span>{manuscript.chapters.length} chapters</span></div>
          {manuscript.chapters.map((chapter) => <div key={chapter.id} className="chapter-tree-group"><button className="chapter-tree-title" type="button" onClick={() => { const first = chapter.sections[0]; if (first) { setSelectedId(first.id); void loadVersions(first.id); } }}><span>{chapter.number}</span><strong>{chapter.title}</strong></button>{chapter.sections.map((section) => <button type="button" key={section.id} className={`section-tree-item ${selectedId === section.id ? "active" : ""}`} onClick={() => { setSelectedId(section.id); void loadVersions(section.id); }}><span>{section.number}</span><span>{section.title}</span><em>{countWords(section.content)}</em></button>)}</div>)}
        </aside>
        <form className="section-editor panel" onSubmit={saveSection}>
          {selected ? <>
            <div className="editor-header"><div><p className="eyebrow">Section {selected.number}</p><h2>{selected.title}</h2><span>{countWords(selected.content)} / {selected.targetWords} words · {selected.humanEditStatus}</span></div><div className="editor-actions">{selected.locked && <span className="locked-label"><Lock size={14} />已锁定</span>}<button className="button secondary" type="button" onClick={() => void generateSection()} disabled={generating || selected.locked}><Sparkles size={15} />{generating ? "分层生成中" : "分层起草"}</button><button className="button primary" type="submit" disabled={saving || selected.locked}><Save size={15} />{saving ? "保存中" : "保存版本"}</button></div></div>
            <label className="editor-label"><span>English draft</span><textarea value={selected.content} onChange={(event) => updateSection({ content: event.target.value })} placeholder="Write or paste the approved English section here. Planned content must use future-oriented language until data are collected." disabled={selected.locked} /></label>
            <div className="editor-grid"><label><span>研究状态</span><select value={selected.researchStatus} onChange={(event) => updateSection({ researchStatus: event.target.value as ManuscriptSection["researchStatus"] })}><option value="planned">planned</option><option value="completed">completed</option><option value="verified">verified</option></select></label><label><span>章节审阅状态</span><select value={selected.status} onChange={(event) => updateSection({ status: event.target.value as ManuscriptSection["status"] })}><option value="draft">draft</option><option value="evidence-checked">evidence-checked</option><option value="methods-checked">methods-checked</option><option value="supervisor-reviewed">supervisor-reviewed</option><option value="approved">approved</option></select></label><label><span>目标字数</span><input type="number" min="0" value={selected.targetWords} onChange={(event) => updateSection({ targetWords: Number(event.target.value) })} /></label><label><span>引用 ID（逗号分隔）</span><input value={selected.citationIds.join(", ")} onChange={(event) => updateSection({ citationIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="akerlof1970" /></label><label><span>Claim ID（逗号分隔）</span><input value={selected.claimIds.join(", ")} onChange={(event) => updateSection({ claimIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="claim-1" /></label></div>
            <div className="editor-notice"><ShieldCheck size={15} /><span>AI 生成只记录模型与提示模板，不会自动提升为证据核验或导师批准。Results 章节在没有真实 AnalysisRun 时会被服务端阻断。</span></div>
          </> : <div className="empty-draft">请选择左侧章节</div>}
        </form>
        <aside className="review-panel panel">
          <div className="review-panel-heading"><History size={16} /><div><strong>DraftVersion历史</strong><span>当前章节</span></div></div>
          {versions.length === 0 ? <p className="empty-review">保存后显示版本和变更摘要。</p> : <div className="version-list">{versions.map((version) => <div key={version.id}><div><strong>v{version.versionNumber}</strong><span>{new Date(version.createdAt).toLocaleString("zh-CN")}</span></div><p>{version.changeSummary}</p><button className="button secondary" type="button" onClick={() => void restore(version.id)}><History size={13} />恢复</button></div>)}</div>}
          {selected && <div className="review-counts"><span><Quote size={13} /> 引用 {selected.citationIds.length}</span><span><Network size={13} /> 论断 {selected.claimIds.length}</span><span><ShieldCheck size={13} /> 未支持 {selected.unsupportedStatements.length}</span></div>}
          {selected && selected.unsupportedStatements.length > 0 && <section className="unsupported-claims-panel" aria-label="未支持论断"><strong>未支持论断</strong>{selected.unsupportedStatements.map((item, index) => <p key={`${item.statement}-${index}`}>{item.statement}<small>{item.reason}</small></p>)}</section>}
        </aside>
      </div>
    </div>
  );
}

export function EvidenceExcerptCenter({ data, notify, projectId }: { data: WorkspaceData; notify: (message: string) => void; projectId: string }) {
  const [excerpts, setExcerpts] = useState<EvidenceExcerpt[]>([]);
  const [assets, setAssets] = useState<FullTextAsset[]>([]);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [form, setForm] = useState({ workId: data.works[0]?.id ?? "", fullTextAssetId: "", locator: "", page: "", quote: "", paraphrase: "", claimId: "", supportDirection: "supporting", strength: "medium", relevance: "medium", reviewer: "", reviewDate: "", verificationStatus: "unverified", externalModelUsePermission: "prohibited", exportPermission: "allowed" });
  async function refresh() { const [excerptResponse, assetResponse] = await Promise.all([fetch(`/api/evidence-excerpts?projectId=${encodeURIComponent(projectId)}`), fetch(`/api/projects/${encodeURIComponent(projectId)}/full-text`)]); const result = await excerptResponse.json() as { excerpts?: EvidenceExcerpt[] }; const assetResult = await assetResponse.json() as { assets?: FullTextAsset[] }; setExcerpts(result.excerpts ?? []); setAssets(assetResult.assets ?? []); }
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function uploadAsset() { if (!assetFile || !form.workId) return notify("请选择 Work 和 PDF 文件"); const body = new FormData(); body.set("workId", form.workId); body.set("file", assetFile); body.set("rightsStatus", "unknown"); const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/full-text`, { method: "POST", body }); const result = await response.json() as { asset?: FullTextAsset; error?: string }; if (!response.ok || !result.asset) return notify(result.error ?? "PDF解析失败"); setAssetFile(null); setForm((current) => ({ ...current, fullTextAssetId: result.asset!.id })); await refresh(); notify(`PDF已按页解析：${result.asset.pageCount ?? 0} 页；默认禁止发送给外部模型`); }
  async function add(event: FormEvent) { event.preventDefault(); const response = await fetch(`/api/evidence-excerpts?projectId=${encodeURIComponent(projectId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, fullTextAssetId: form.fullTextAssetId || undefined, page: form.page || undefined, claimId: form.claimId || null, quote: form.quote || undefined, paraphrase: form.paraphrase || undefined, reviewer: form.reviewer || undefined, reviewDate: form.reviewDate || undefined }) }); const result = await response.json() as { excerpt?: EvidenceExcerpt; error?: string }; if (!response.ok) return notify(apiError(result, "证据摘录保存失败")); setForm((current) => ({ ...current, locator: "", page: "", quote: "", paraphrase: "", claimId: "" })); await refresh(); notify("EvidenceExcerpt已保存；human_verified必须有研究者核验信息"); }
  async function remove(id: string) { const response = await fetch(`/api/evidence-excerpts?id=${encodeURIComponent(id)}&projectId=${encodeURIComponent(projectId)}`, { method: "DELETE" }); if (!response.ok) return notify("证据摘录删除失败"); await refresh(); notify("EvidenceExcerpt已删除"); }
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Claim-level evidence</p><h1>证据摘录</h1><p>每条外部论断必须能定位到文献页码、段落、表格或图形。搜索发现不能直接成为证据；默认禁止全文发送给外部模型。</p></header><section className="panel evidence-upload"><div className="panel-title"><Upload size={17}/><div><h2>上传本地 PDF</h2><p>文件保存在当前项目的 .local 路径并按页解析；系统不会自动抓取付费全文。</p></div></div><div className="evidence-form-grid"><label><span>关联 Work</span><select value={form.workId} onChange={(event) => setForm({ ...form, workId: event.target.value })}>{data.works.map((work) => <option key={work.id} value={work.id}>{work.id} · {work.title.slice(0, 60)}</option>)}</select></label><label><span>PDF 文件</span><input type="file" accept="application/pdf" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} /></label></div><button className="button secondary" type="button" onClick={() => void uploadAsset()} disabled={!assetFile}><Upload size={15}/>上传并解析</button>{assets.length > 0 && <p className="form-hint">已解析全文：{assets.map((asset) => `${asset.id}（${asset.pageCount ?? "?"}页，${asset.status}，外部模型：${asset.externalModelUsePermission}）`).join("；")}</p>}</section><form className="evidence-form panel" onSubmit={add}><div className="evidence-form-grid"><label><span>来源</span><select value={form.workId} onChange={(event) => setForm({ ...form, workId: event.target.value })}>{data.works.map((work) => <option key={work.id} value={work.id}>{work.id} · {work.title.slice(0, 60)}</option>)}</select></label><label><span>全文资产</span><select value={form.fullTextAssetId} onChange={(event) => setForm({ ...form, fullTextAssetId: event.target.value })}><option value="">无（人工定位）</option>{assets.filter((asset) => asset.workId === form.workId).map((asset) => <option key={asset.id} value={asset.id}>{asset.id} · {asset.status}</option>)}</select></label><label><span>定位（页码/段落/表格）</span><input value={form.locator} onChange={(event) => setForm({ ...form, locator: event.target.value })} placeholder="p. 488, Table 2" /></label><label><span>页码</span><input value={form.page} onChange={(event) => setForm({ ...form, page: event.target.value })} /></label><label><span>Claim ID</span><input value={form.claimId} onChange={(event) => setForm({ ...form, claimId: event.target.value })} placeholder="claim-1" /></label><label><span>支持方向</span><select value={form.supportDirection} onChange={(event) => setForm({ ...form, supportDirection: event.target.value })}><option value="supporting">supporting</option><option value="contradicting">contradicting</option><option value="mixed">mixed</option><option value="context-only">context-only</option></select></label><label className="full"><span>原文短引文（可选）</span><textarea value={form.quote} onChange={(event) => setForm({ ...form, quote: event.target.value })} maxLength={2000} placeholder="若关联本地全文，系统会检查连续原文。" /></label><label className="full"><span>研究者释义</span><textarea value={form.paraphrase} onChange={(event) => setForm({ ...form, paraphrase: event.target.value })} maxLength={5000} placeholder="只填写支持该论断所需的最小内容。" /></label><label><span>核验状态</span><select value={form.verificationStatus} onChange={(event) => setForm({ ...form, verificationStatus: event.target.value })}><option value="unverified">unverified</option><option value="ai_suggested">ai_suggested</option><option value="human_verified">human_verified</option><option value="rejected">rejected</option></select></label><label><span>核验者</span><input value={form.reviewer} onChange={(event) => setForm({ ...form, reviewer: event.target.value })} /></label><label><span>核验日期</span><input type="date" value={form.reviewDate} onChange={(event) => setForm({ ...form, reviewDate: event.target.value })} /></label></div><button className="button primary" type="submit"><Plus size={15} />保存摘录</button></form><div className="table-shell evidence-table"><table><thead><tr><th>来源 / 定位</th><th>Claim</th><th>内容</th><th>方向 / 状态</th><th><span className="sr-only">操作</span></th></tr></thead><tbody>{excerpts.map((excerpt) => <tr key={excerpt.id}><td><strong>{excerpt.workId}</strong><span>{excerpt.page ? `p. ${excerpt.page}` : "未填写页码"}{excerpt.locator ? ` · ${excerpt.locator}` : ""}</span></td><td>{excerpt.claimId ?? "未绑定"}</td><td className="excerpt-copy">{excerpt.paraphrase ?? excerpt.quote}</td><td><span className={`status ${excerpt.verificationStatus === "human_verified" ? "positive" : "warning"}`}>{excerpt.supportDirection} · {excerpt.verificationStatus}</span></td><td><button className="icon-button danger" type="button" onClick={() => void remove(excerpt.id)} aria-label="删除证据摘录" title="删除"><Trash2 size={15} /></button></td></tr>)}{excerpts.length === 0 && <tr><td colSpan={5}><div className="empty-review">尚无摘录；从第一条需要页码定位的外部论断开始。</div></td></tr>}</tbody></table></div></div>;
}

export function ResearchPlanCenter({ data, notify, projectId }: { data: WorkspaceData; notify: (message: string) => void; projectId: string }) {
  const [plan, setPlan] = useState<ResearchPlanState>({ schemaVersion: 1, hypotheses: [], analysisPlans: [], updatedAt: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => { void fetch(`/api/research-plan?projectId=${encodeURIComponent(projectId)}`).then((response) => response.json()).then(setPlan).catch(() => notify("研究计划加载失败")); }, [notify, projectId]);
  function addHypothesis() { const index = plan.hypotheses.length + 1; const next: Hypothesis = { id: `h${Date.now()}`, number: `H${index}`, englishWording: "", chineseExplanation: "", type: "main effect", theoryIds: [], constructIds: [], studyIds: [data.experiments[0]?.id ?? ""], direction: "", boundary: "", evidenceIds: [], evidenceClass: "confirmatory", priority: "primary", falsification: "", reviewStatus: "draft" }; setPlan({ ...plan, hypotheses: [...plan.hypotheses, next] }); }
  function updateHypothesis(id: string, patch: Partial<Hypothesis>) { setPlan({ ...plan, hypotheses: plan.hypotheses.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function updateAnalysis(id: string, patch: Partial<AnalysisPlan>) { setPlan({ ...plan, analysisPlans: plan.analysisPlans.map((item) => item.id === id ? { ...item, ...patch } : item) }); }
  function ensureAnalysis(hypothesis: Hypothesis) { if (plan.analysisPlans.some((item) => item.hypothesisIds.includes(hypothesis.id))) return; setPlan({ ...plan, analysisPlans: [...plan.analysisPlans, { id: `analysis-${hypothesis.id}`, studyId: hypothesis.studyIds[0] ?? "", hypothesisIds: [hypothesis.id], estimand: "", model: "", formula: "", analysisClass: hypothesis.priority, dataStatus: "planned", power: { method: "", assumptions: "" }, exclusions: "", missing: { strategy: "" }, robustness: [] }] }); }
  async function save() { setSaving(true); const response = await fetch(`/api/research-plan?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ hypotheses: plan.hypotheses, analysisPlans: plan.analysisPlans }) }); const result = await response.json() as ResearchPlanState & { error?: string }; setSaving(false); if (!response.ok) return notify(apiError(result, "研究计划保存失败")); setPlan(result); notify("假设与分析计划已保存"); }
  const matrix = plan.hypotheses.map((hypothesis, index) => { const analysis = plan.analysisPlans.find((candidate) => candidate.hypothesisIds.includes(hypothesis.id)); const study = data.experiments.find((candidate) => hypothesis.studyIds.includes(candidate.id)); const construct = data.constructs.find((candidate) => hypothesis.constructIds.includes(candidate.id)); return { hypothesis, analysis, study, construct, index }; });
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Hypotheses and estimands</p><h1>假设与分析计划</h1><p>每个假设都必须连接理论、构念、研究和可证伪条件；确认性与探索性分析分开保存。</p></header><div className="plan-actions"><span>{plan.hypotheses.length} 条假设 · {plan.analysisPlans.length} 个分析计划</span><div><button className="button secondary" type="button" onClick={addHypothesis}><Plus size={15} />新增假设</button><button className="button primary" type="button" onClick={() => void save()} disabled={saving}><Save size={15} />{saving ? "保存中" : "保存研究计划"}</button></div></div><section className="hypothesis-list">{plan.hypotheses.map((hypothesis) => <article className="hypothesis-editor panel" key={hypothesis.id}><header><div><span className="plain-tag">{hypothesis.number} · {hypothesis.evidenceClass} · {hypothesis.priority}</span><h2>{hypothesis.englishWording || "未填写英文假设"}</h2></div><select value={hypothesis.reviewStatus} onChange={(event) => updateHypothesis(hypothesis.id, { reviewStatus: event.target.value as Hypothesis["reviewStatus"] })}><option value="draft">draft</option><option value="needs_review">needs_review</option><option value="approved">approved</option><option value="needs_revision">needs_revision</option></select></header><div className="hypothesis-fields"><label><span>英文表述</span><textarea value={hypothesis.englishWording} onChange={(event) => updateHypothesis(hypothesis.id, { englishWording: event.target.value })} /></label><label><span>中文推导</span><textarea value={hypothesis.chineseExplanation} onChange={(event) => updateHypothesis(hypothesis.id, { chineseExplanation: event.target.value })} /></label><label><span>类型</span><input value={hypothesis.type} onChange={(event) => updateHypothesis(hypothesis.id, { type: event.target.value })} /></label><label><span>方向</span><input value={hypothesis.direction} onChange={(event) => updateHypothesis(hypothesis.id, { direction: event.target.value })} /></label><label><span>边界条件</span><input value={hypothesis.boundary} onChange={(event) => updateHypothesis(hypothesis.id, { boundary: event.target.value })} /></label><label><span>可证伪条件</span><input value={hypothesis.falsification} onChange={(event) => updateHypothesis(hypothesis.id, { falsification: event.target.value })} /></label><label><span>理论 ID</span><input value={hypothesis.theoryIds.join(", ")} onChange={(event) => updateHypothesis(hypothesis.id, { theoryIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="signaling" /></label><label><span>构念 ID</span><input value={hypothesis.constructIds.join(", ")} onChange={(event) => updateHypothesis(hypothesis.id, { constructIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="authenticity, contact-intention" /></label><label><span>Study ID</span><input value={hypothesis.studyIds.join(", ")} onChange={(event) => updateHypothesis(hypothesis.id, { studyIds: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} placeholder="experiment-1" /></label></div><div className="hypothesis-footer"><span>证据 ID：{hypothesis.evidenceIds.join(", ") || "未绑定"}</span><button className="button secondary" type="button" onClick={() => ensureAnalysis(hypothesis)}><Table2 size={14} />建立分析计划</button></div></article>)}{plan.hypotheses.length === 0 && <div className="empty-draft">尚未登记假设。请从 H1 开始，先写英文可检验命题，再补中文理论推导。</div>}</section><section className="analysis-plan-list"><div className="band-heading"><div><p className="eyebrow">Analysis plan registry</p><h2>估计量与模型</h2></div></div>{plan.analysisPlans.map((analysis) => <article className="analysis-plan-row panel" key={analysis.id}><div className="analysis-plan-heading"><strong>{analysis.id}</strong><span>{analysis.hypothesisIds.join(", ")} · {analysis.analysisClass}</span></div><div className="analysis-plan-fields"><label><span>Primary estimand</span><input value={analysis.estimand} onChange={(event) => updateAnalysis(analysis.id, { estimand: event.target.value })} /></label><label><span>Statistical model</span><input value={analysis.model} onChange={(event) => updateAnalysis(analysis.id, { model: event.target.value })} /></label><label><span>Formula</span><input value={analysis.formula} onChange={(event) => updateAnalysis(analysis.id, { formula: event.target.value })} /></label><label><span>Data status</span><select value={analysis.dataStatus} onChange={(event) => updateAnalysis(analysis.id, { dataStatus: event.target.value as AnalysisPlan["dataStatus"] })}><option value="planned">planned</option><option value="collecting">collecting</option><option value="ready">ready</option><option value="analyzed">analyzed</option><option value="blocked">blocked</option></select></label></div></article>)}</section><section className="matrix-section"><div className="band-heading"><div><p className="eyebrow">Traceability matrix</p><h2>研究矩阵</h2></div><span>断链项会显示为阻断</span></div><div className="table-shell matrix-table"><table><thead><tr><th>Study</th><th>Hypothesis</th><th>Construct</th><th>Manipulation / Measure</th><th>Primary estimand</th><th>Analysis</th><th>Evidence</th></tr></thead><tbody>{matrix.map(({ hypothesis, analysis, study, construct }) => { const complete = Boolean(study && construct && analysis?.estimand && analysis.model && hypothesis.englishWording); return <tr key={hypothesis.id}><td>{study?.name ?? "断链：Study"}</td><td><strong>{hypothesis.number}</strong><span>{hypothesis.englishWording || "缺少英文表述"}</span></td><td>{construct?.nameEn ?? "断链：Construct"}</td><td>{study?.conditions.join("; ") ?? "未登记"}</td><td>{analysis?.estimand ?? "断链：Estimand"}</td><td>{analysis?.model ?? "断链：Analysis model"}</td><td><span className={`status ${complete ? "positive" : "warning"}`}>{complete ? "traceable" : "blocking gap"}</span></td></tr>; })}{matrix.length === 0 && <tr><td colSpan={7}>保存假设后自动生成矩阵。</td></tr>}</tbody></table></div></section></div>;
}

export function ResultsCenter({ notify, projectId }: { notify: (message: string) => void; projectId: string }) {
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [registry, setRegistry] = useState<DatasetRegistry>({ datasets: [], datasetVersions: [], variableDictionaries: [], reproducibilityChecks: [], updatedAt: "" });
  const [datasetForm, setDatasetForm] = useState({ datasetId: "", studyId: "experiment-1", name: "", source: "", finalN: "", ethicsStatus: "pending", dataAvailability: "planned", versionId: "", version: "v1", fileName: "", storagePath: "", checksum: "", rowCount: "", isRealData: false, variablesText: "" });
  const [form, setForm] = useState({ id: "", studyId: "experiment-1", datasetVersionId: "", sampleN: "", status: "planned", isRealData: false, estimand: "", estimate: "", pValue: "", ciLower: "", ciUpper: "" });
  async function refresh() { const scope = `projectId=${encodeURIComponent(projectId)}`; const [runResponse, datasetResponse] = await Promise.all([fetch(`/api/results?${scope}`), fetch(`/api/datasets?${scope}`)]); const result = await runResponse.json() as { runs?: AnalysisRun[] }; const datasets = await datasetResponse.json() as DatasetRegistry; setRuns(result.runs ?? []); setRegistry(datasets); }
  useEffect(() => { void refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function saveDataset(event: FormEvent) {
    event.preventDefault();
    const datasetId = datasetForm.datasetId || `dataset-${Date.now()}`;
    const versionId = datasetForm.versionId || `${datasetId}-${datasetForm.version || "v1"}`;
    const variables = datasetForm.variablesText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
      const [name, dataType = "number", role = "other", constructId = "", coding = ""] = line.split("|").map((item) => item.trim());
      const allowedTypes = ["string", "integer", "number", "boolean", "date", "ordinal", "categorical"] as const;
      const allowedRoles = ["id", "demographic", "manipulation", "outcome", "mediator", "moderator", "covariate", "other"] as const;
      return { name, label: name, dataType: allowedTypes.find((item) => item === dataType) ?? "number", role: allowedRoles.find((item) => item === role) ?? "other", coding, missingValues: [], constructId, notes: "" };
    });
    const dataset = { id: datasetId, studyId: datasetForm.studyId, name: datasetForm.name, description: "", source: datasetForm.source, collectionStart: "", collectionEnd: "", sampleFunnel: "", finalN: datasetForm.finalN ? Number(datasetForm.finalN) : null, dataAvailability: datasetForm.dataAvailability as "planned" | "private" | "open", ethicsStatus: datasetForm.ethicsStatus as "pending" | "submitted" | "approved" | "not-required", notes: "" };
    const datasetVersion = { id: versionId, datasetId, version: datasetForm.version, fileName: datasetForm.fileName, storagePath: datasetForm.storagePath, checksum: datasetForm.checksum, rowCount: datasetForm.rowCount ? Number(datasetForm.rowCount) : null, isRealData: datasetForm.isRealData, createdAt: new Date().toISOString(), notes: "" };
    const dictionary = { id: `dictionary-${versionId}`, datasetVersionId: versionId, variables, updatedAt: new Date().toISOString(), notes: "" };
    const next = { ...registry, datasets: [...registry.datasets.filter((item) => item.id !== datasetId), dataset], datasetVersions: [...registry.datasetVersions.filter((item) => item.id !== versionId), datasetVersion], variableDictionaries: [...registry.variableDictionaries.filter((item) => item.datasetVersionId !== versionId), dictionary] };
    const response = await fetch(`/api/datasets?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
    const result = await response.json() as DatasetRegistry & { error?: string };
    if (!response.ok) return notify(apiError(result, "Dataset版本保存失败"));
    setRegistry(result);
    setForm((current) => ({ ...current, studyId: datasetForm.studyId, datasetVersionId: versionId, sampleN: datasetForm.finalN, isRealData: datasetForm.isRealData }));
    notify("Dataset、版本和变量字典已保存");
  }
  async function save(event: FormEvent) { event.preventDefault(); const response = await fetch(`/api/results?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: form.id || `run-${Date.now()}`, studyId: form.studyId, datasetVersionId: form.datasetVersionId, status: form.status, isRealData: form.isRealData, sampleN: form.sampleN ? Number(form.sampleN) : null, scriptPath: "", environment: "", outputChecksum: "", ranAt: new Date().toISOString(), resultEstimates: form.estimand && form.estimate ? [{ id: `estimate-${Date.now()}`, estimand: form.estimand, estimate: Number(form.estimate), standardError: null, ciLower: form.ciLower ? Number(form.ciLower) : null, ciUpper: form.ciUpper ? Number(form.ciUpper) : null, pValue: form.pValue ? Number(form.pValue) : null, effectSize: null, preregistered: true, notes: "" }] : [], robustnessChecks: [], notes: "研究者登记；请补充脚本、环境和checksum。" }) }); const result = await response.json() as { runs?: AnalysisRun[]; error?: string }; if (!response.ok) return notify(apiError(result, "AnalysisRun保存失败")); setRuns(result.runs ?? []); notify("AnalysisRun已保存；只有真实完成运行可解锁 Results"); }
  return <div className="page-content doctoral-page">
    <header className="section-header">
      <p className="eyebrow">Data and results registry</p>
      <h1>数据与结果</h1>
      <p>先登记 Dataset、版本和变量字典，再登记 AnalysisRun。结果数字只能来自结构化运行；计划不会解锁 Results。</p>
    </header>
    <form className="results-form dataset-form panel" onSubmit={saveDataset}>
      <div className="panel-title"><Upload size={17} /><div><h2>Dataset 与变量字典</h2><p>文件保留在研究者控制的存储位置；系统保存路径、checksum、版本和结构化变量定义。</p></div></div>
      <div className="results-form-grid">
        <label><span>Dataset ID</span><input value={datasetForm.datasetId} onChange={(event) => setDatasetForm({ ...datasetForm, datasetId: event.target.value })} placeholder="dataset-study-1" /></label>
        <label><span>Study ID</span><input required value={datasetForm.studyId} onChange={(event) => setDatasetForm({ ...datasetForm, studyId: event.target.value })} /></label>
        <label><span>Dataset name</span><input required value={datasetForm.name} onChange={(event) => setDatasetForm({ ...datasetForm, name: event.target.value })} /></label>
        <label><span>Source</span><input value={datasetForm.source} onChange={(event) => setDatasetForm({ ...datasetForm, source: event.target.value })} placeholder="Survey platform / laboratory" /></label>
        <label><span>Final N</span><input type="number" min="0" value={datasetForm.finalN} onChange={(event) => setDatasetForm({ ...datasetForm, finalN: event.target.value })} /></label>
        <label><span>Ethics</span><select value={datasetForm.ethicsStatus} onChange={(event) => setDatasetForm({ ...datasetForm, ethicsStatus: event.target.value })}><option value="pending">pending</option><option value="submitted">submitted</option><option value="approved">approved</option><option value="not-required">not-required</option></select></label>
        <label><span>Availability</span><select value={datasetForm.dataAvailability} onChange={(event) => setDatasetForm({ ...datasetForm, dataAvailability: event.target.value })}><option value="planned">planned</option><option value="private">private</option><option value="open">open</option></select></label>
        <label><span>Version ID</span><input value={datasetForm.versionId} onChange={(event) => setDatasetForm({ ...datasetForm, versionId: event.target.value })} placeholder="dataset-study-1-v1" /></label>
        <label><span>Version</span><input required value={datasetForm.version} onChange={(event) => setDatasetForm({ ...datasetForm, version: event.target.value })} /></label>
        <label><span>File name</span><input value={datasetForm.fileName} onChange={(event) => setDatasetForm({ ...datasetForm, fileName: event.target.value })} /></label>
        <label><span>Storage path</span><input value={datasetForm.storagePath} onChange={(event) => setDatasetForm({ ...datasetForm, storagePath: event.target.value })} /></label>
        <label><span>SHA-256 checksum</span><input value={datasetForm.checksum} onChange={(event) => setDatasetForm({ ...datasetForm, checksum: event.target.value })} placeholder="sha256:..." /></label>
        <label><span>Row count</span><input type="number" min="0" value={datasetForm.rowCount} onChange={(event) => setDatasetForm({ ...datasetForm, rowCount: event.target.value })} /></label>
        <label className="check-inline"><input type="checkbox" checked={datasetForm.isRealData} onChange={(event) => setDatasetForm({ ...datasetForm, isRealData: event.target.checked })} /><span>真实采集数据</span></label>
        <label className="full"><span>Variables（每行：name | data type | role | construct ID | coding）</span><textarea value={datasetForm.variablesText} onChange={(event) => setDatasetForm({ ...datasetForm, variablesText: event.target.value })} placeholder="outcome_score | number | outcome | primary-outcome | 1-7" /></label>
      </div>
      <button className="button primary" type="submit"><Save size={15} />保存 Dataset 版本</button>
    </form>
    <form className="results-form panel" onSubmit={save}>
      <div className="panel-title"><Table2 size={17} /><div><h2>AnalysisRun</h2><p>{registry.datasetVersions.length} 个 DatasetVersion 已登记。</p></div></div>
      <div className="results-form-grid">
        <label><span>Study ID</span><input required value={form.studyId} onChange={(event) => setForm({ ...form, studyId: event.target.value })} /></label>
        <label><span>Dataset version</span><input required list="dataset-version-options" value={form.datasetVersionId} onChange={(event) => setForm({ ...form, datasetVersionId: event.target.value })} placeholder="dataset-v1" /><datalist id="dataset-version-options">{registry.datasetVersions.map((version) => <option key={version.id} value={version.id} />)}</datalist></label>
        <label><span>Sample N</span><input type="number" min="0" value={form.sampleN} onChange={(event) => setForm({ ...form, sampleN: event.target.value })} /></label>
        <label><span>运行状态</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="planned">planned</option><option value="running">running</option><option value="completed">completed</option><option value="failed">failed</option></select></label>
        <label className="check-inline"><input type="checkbox" checked={form.isRealData} onChange={(event) => setForm({ ...form, isRealData: event.target.checked })} /><span>确认这是已收集的真实数据</span></label>
        <label><span>Estimand</span><input value={form.estimand} onChange={(event) => setForm({ ...form, estimand: event.target.value })} /></label>
        <label><span>Estimate</span><input type="number" step="any" value={form.estimate} onChange={(event) => setForm({ ...form, estimate: event.target.value })} /></label>
        <label><span>p value</span><input type="number" min="0" max="1" step="any" value={form.pValue} onChange={(event) => setForm({ ...form, pValue: event.target.value })} /></label>
        <label><span>CI lower / upper</span><div className="ci-fields"><input type="number" step="any" value={form.ciLower} onChange={(event) => setForm({ ...form, ciLower: event.target.value })} /><input type="number" step="any" value={form.ciUpper} onChange={(event) => setForm({ ...form, ciUpper: event.target.value })} /></div></label>
      </div>
      <button className="button primary" type="submit"><Upload size={15} />登记分析运行</button>
    </form>
    <div className="table-shell results-table"><table><thead><tr><th>Run</th><th>Study / Dataset</th><th>状态</th><th>结果</th><th>门控</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td><strong>{run.id}</strong><span>{new Date(run.ranAt).toLocaleString("zh-CN")}</span></td><td>{run.studyId} · {run.datasetVersionId}<br />N = {run.sampleN ?? "未填写"}</td><td>{run.status} · {run.isRealData ? "真实数据" : "计划"}</td><td>{run.resultEstimates.map((estimate) => <div key={estimate.id}>{estimate.estimand}: {estimate.estimate}{estimate.pValue === null ? "" : ` (p = ${estimate.pValue})`}</div>)}</td><td><span className={`status ${run.status === "completed" && run.isRealData ? "positive" : "warning"}`}>{run.status === "completed" && run.isRealData ? "Results unlocked" : "blocked"}</span></td></tr>)}{runs.length === 0 && <tr><td colSpan={5}>尚无 AnalysisRun。当前不能生成 Results 章节。</td></tr>}</tbody></table></div>
  </div>;
}

export function OutputsCenter({ notify, projectId }: { notify: (message: string) => void; projectId: string }) {
  const [status, setStatus] = useState<{ errors: string[]; warnings: string[] } | null>(null);
  useEffect(() => { void fetch(`/api/quality?projectId=${encodeURIComponent(projectId)}`).then((response) => response.json()).then(setStatus).catch(() => notify("质量检查加载失败")); }, [notify, projectId]);
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Project outputs</p><h1>输出与格式检查</h1><p>项目包包含当前项目的全部开题、论文、参考文献、质量报告和可审计 manifest；预测稿会保持醒目标识。</p></header><div className="output-actions"><a className="button primary" href={`/api/projects/${encodeURIComponent(projectId)}/exports/bundle`}><FileOutput size={15}/>导出项目 ZIP</a></div><section className="quality-panel panel"><div className="panel-title"><ShieldCheck size={17}/><div><h2>项目级质量门控</h2><p>项目隔离、证据追踪和实证结果门控。</p></div></div>{status ? <><div className="quality-summary"><strong>{status.errors.length}</strong><span>errors</span><strong>{status.warnings.length}</strong><span>warnings</span></div><div className="quality-issues">{[...status.errors.map((item) => ({ item, tone: "error" })), ...status.warnings.map((item) => ({ item, tone: "warning" }))].map(({ item, tone }) => <div className={tone} key={`${tone}-${item}`}>{item}</div>)}</div></> : <div className="empty-review">正在运行检查…</div>}</section></div>;
}

export function ReviewCenter({ notify, projectId }: { notify: (message: string) => void; projectId: string }) {
  const [workflow, setWorkflow] = useState<{ id: string; title: string; researchQuestion: string; databases: Array<{ id: string; name: string; platform: string; url: string; accessDate: string; notes: string }>; searchRuns: Array<{ id: string; databaseSourceId: string; searchString: string; fields: string[]; runDate: string; filters: string; rawResultCount: number; deduplicatedCount: number; titleAbstractScreened: number; fullTextAssessed: number; includedCount: number; notes: string }>; screeningDecisions: unknown[]; citationChases: unknown[]; themes: unknown[]; updatedAt: string } | null>(null);
  const [run, setRun] = useState({ databaseSourceId: "openalex-discovery", searchString: "", runDate: new Date().toISOString().slice(0, 10), filters: "", rawResultCount: "0", deduplicatedCount: "0", titleAbstractScreened: "0", fullTextAssessed: "0", includedCount: "0" });
  useEffect(() => { void fetch(`/api/review-workflow?projectId=${encodeURIComponent(projectId)}`).then((response) => response.json()).then(setWorkflow).catch(() => notify("系统综述协议加载失败")); }, [notify, projectId]);
  async function save() { if (!workflow) return; const nextRun = { id: `search-${Date.now()}`, databaseSourceId: run.databaseSourceId, searchString: run.searchString, fields: ["title", "abstract", "keywords"], runDate: run.runDate, filters: run.filters, rawResultCount: Number(run.rawResultCount), deduplicatedCount: Number(run.deduplicatedCount), titleAbstractScreened: Number(run.titleAbstractScreened), fullTextAssessed: Number(run.fullTextAssessed), includedCount: Number(run.includedCount), notes: "OpenAlex or database export; candidate metadata is not automatic inclusion." }; const response = await fetch(`/api/review-workflow?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...workflow, searchRuns: [...workflow.searchRuns, nextRun] }) }); const result = await response.json() as typeof workflow & { error?: string }; if (!response.ok) return notify(apiError(result, "检索运行保存失败")); setWorkflow(result); notify("SearchRun和PRISMA计数已保存"); }
  if (!workflow) return <div className="page-content"><div className="empty-draft">正在加载系统综述协议…</div></div>;
  const totals = workflow.searchRuns.reduce((sum, item) => ({ identified: sum.identified + item.rawResultCount, dedup: sum.dedup + item.deduplicatedCount, screened: sum.screened + item.titleAbstractScreened, fullText: sum.fullText + item.fullTextAssessed, included: sum.included + item.includedCount }), { identified: 0, dedup: 0, screened: 0, fullText: 0, included: 0 });
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Systematic review protocol</p><h1>系统综述与 PRISMA</h1><p>记录数据库、检索式、日期、过滤条件、去重和筛选阶段。OpenAlex 只用于发现候选，不等于纳入系统综述。</p></header><section className="review-protocol panel"><label><span>Review question</span><textarea value={workflow.researchQuestion} onChange={(event) => setWorkflow({ ...workflow, researchQuestion: event.target.value })} /></label><div className="prisma-strip"><div><span>Identified</span><strong>{totals.identified}</strong></div><div><span>After deduplication</span><strong>{totals.dedup}</strong></div><div><span>Title/abstract</span><strong>{totals.screened}</strong></div><div><span>Full text</span><strong>{totals.fullText}</strong></div><div><span>Included</span><strong>{totals.included}</strong></div></div></section><section className="search-run-form panel"><div className="panel-title"><Search size={17} /><div><h2>登记 SearchRun</h2><p>每次运行保持可复现，不覆盖历史检索。</p></div></div><div className="search-run-fields"><label><span>Database source</span><select value={run.databaseSourceId} onChange={(event) => setRun({ ...run, databaseSourceId: event.target.value })}>{workflow.databases.map((database) => <option key={database.id} value={database.id}>{database.name}</option>)}</select></label><label><span>Run date</span><input type="date" value={run.runDate} onChange={(event) => setRun({ ...run, runDate: event.target.value })} /></label><label className="full"><span>Search string</span><textarea required value={run.searchString} onChange={(event) => setRun({ ...run, searchString: event.target.value })} /></label><label className="full"><span>Filters / exclusion notes</span><input value={run.filters} onChange={(event) => setRun({ ...run, filters: event.target.value })} /></label><div className="count-inputs">{(["rawResultCount", "deduplicatedCount", "titleAbstractScreened", "fullTextAssessed", "includedCount"] as const).map((key) => <label key={key}><span>{key}</span><input type="number" min="0" value={run[key]} onChange={(event) => setRun({ ...run, [key]: event.target.value })} /></label>)}</div></div><button className="button primary" type="button" onClick={() => void save()}><Save size={15} />保存检索运行</button></section><div className="table-shell search-run-table"><table><thead><tr><th>Run</th><th>Database</th><th>String</th><th>PRISMA counts</th></tr></thead><tbody>{workflow.searchRuns.map((item) => <tr key={item.id}><td><strong>{item.id}</strong><span>{item.runDate}</span></td><td>{workflow.databases.find((database) => database.id === item.databaseSourceId)?.name ?? item.databaseSourceId}</td><td className="excerpt-copy">{item.searchString}</td><td>{item.rawResultCount} → {item.deduplicatedCount} → {item.titleAbstractScreened} → {item.fullTextAssessed} → {item.includedCount}</td></tr>)}{workflow.searchRuns.length === 0 && <tr><td colSpan={4}>尚无检索运行。</td></tr>}</tbody></table></div></div>;
}

export function MaterialsCenter({ data, notify, projectId }: { data: WorkspaceData; notify: (message: string) => void; projectId: string }) {
  const [registry, setRegistry] = useState<{ studies: unknown[]; stimuli: unknown[]; instruments: Array<{ id: string; constructId: string; name: string; itemSourceWorkId: string; itemSourceLocator: string; permissionStatus: string; validationStatus: string; items: Array<{ id: string; wording: string; responseScale: string; reverseCoded: boolean }>; conceptualDefinition: string; adaptationRecord: string; notes: string }>; pretests: unknown[]; updatedAt: string } | null>(null);
  const [instrument, setInstrument] = useState({ id: "", constructId: data.constructs[0]?.id ?? "", name: "", itemSourceWorkId: "", itemSourceLocator: "", permissionStatus: "unknown", validationStatus: "unverified", conceptualDefinition: "", adaptationRecord: "", itemsText: "", notes: "" });
  useEffect(() => { void fetch(`/api/materials?projectId=${encodeURIComponent(projectId)}`).then((response) => response.json()).then(setRegistry).catch(() => notify("研究材料加载失败")); }, [notify, projectId]);
  async function saveInstrument() { if (!registry) return; const items = instrument.itemsText.split(/\r?\n/).map((wording, index) => wording.trim() ? { id: `item-${index + 1}`, wording, responseScale: "1-7", reverseCoded: false } : null).filter((item): item is { id: string; wording: string; responseScale: string; reverseCoded: boolean } => Boolean(item)); const next = { id: instrument.id || `instrument-${Date.now()}`, constructId: instrument.constructId, name: instrument.name, itemSourceWorkId: instrument.itemSourceWorkId, itemSourceLocator: instrument.itemSourceLocator, permissionStatus: instrument.permissionStatus, validationStatus: instrument.validationStatus, conceptualDefinition: instrument.conceptualDefinition, adaptationRecord: instrument.adaptationRecord, items, notes: instrument.notes }; const response = await fetch(`/api/materials?projectId=${encodeURIComponent(projectId)}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...registry, instruments: [...registry.instruments.filter((item) => item.id !== next.id), next] }) }); const result = await response.json() as typeof registry & { error?: string }; if (!response.ok) return notify(apiError(result, "量表保存失败")); setRegistry(result); notify("量表与题项权限已保存"); }
  if (!registry) return <div className="page-content"><div className="empty-draft">正在加载研究材料…</div></div>;
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Materials and measurement</p><h1>研究材料与量表</h1><p>刺激、事实表、生产协议、模型/提示版本、卖家核验、预试和量表题项都必须有来源、权限和验证状态。</p></header><section className="materials-study-list">{data.experiments.map((experiment) => <article className="panel" key={experiment.id}><span className="plain-tag">{experiment.id}</span><h2>{experiment.name}</h2><p>{experiment.objective}</p><small>材料注册状态：{registry.studies.some((study) => typeof study === "object" && study !== null && "id" in study && study.id === experiment.id) ? "已登记" : "待登记"}</small></article>)}</section><section className="instrument-form panel"><div className="panel-title"><Quote size={17} /><div><h2>登记 Instrument / Scale</h2><p>未完成全文和题项权限核验的量表不能标记为 validity-reviewed。</p></div></div><div className="instrument-fields"><label><span>Construct</span><select value={instrument.constructId} onChange={(event) => setInstrument({ ...instrument, constructId: event.target.value })}>{data.constructs.map((construct) => <option key={construct.id} value={construct.id}>{construct.nameEn}</option>)}</select></label><label><span>Name</span><input value={instrument.name} onChange={(event) => setInstrument({ ...instrument, name: event.target.value })} /></label><label><span>Source Work ID</span><input value={instrument.itemSourceWorkId} onChange={(event) => setInstrument({ ...instrument, itemSourceWorkId: event.target.value })} /></label><label><span>Source locator</span><input value={instrument.itemSourceLocator} onChange={(event) => setInstrument({ ...instrument, itemSourceLocator: event.target.value })} /></label><label><span>Permission</span><select value={instrument.permissionStatus} onChange={(event) => setInstrument({ ...instrument, permissionStatus: event.target.value })}><option value="unknown">unknown</option><option value="cleared">cleared</option><option value="restricted">restricted</option><option value="prohibited">prohibited</option></select></label><label><span>Validation</span><select value={instrument.validationStatus} onChange={(event) => setInstrument({ ...instrument, validationStatus: event.target.value })}><option value="unverified">unverified</option><option value="pretest">pretest</option><option value="reliable">reliable</option><option value="validity-reviewed">validity-reviewed</option></select></label><label className="full"><span>Conceptual definition</span><textarea value={instrument.conceptualDefinition} onChange={(event) => setInstrument({ ...instrument, conceptualDefinition: event.target.value })} /></label><label className="full"><span>Items（每行一个题项）</span><textarea value={instrument.itemsText} onChange={(event) => setInstrument({ ...instrument, itemsText: event.target.value })} /></label><label className="full"><span>Adaptation / permission notes</span><textarea value={instrument.adaptationRecord} onChange={(event) => setInstrument({ ...instrument, adaptationRecord: event.target.value })} /></label></div><button className="button primary" type="button" onClick={() => void saveInstrument()}><Save size={15} />保存量表</button></section><div className="table-shell instrument-table"><table><thead><tr><th>Scale</th><th>Construct</th><th>Source</th><th>Permission</th><th>Validation</th><th>Items</th></tr></thead><tbody>{registry.instruments.map((item) => <tr key={item.id}><td><strong>{item.name || "未命名"}</strong><span>{item.id}</span></td><td>{data.constructs.find((construct) => construct.id === item.constructId)?.nameEn ?? item.constructId}</td><td>{item.itemSourceWorkId || "未绑定"} {item.itemSourceLocator ? `· ${item.itemSourceLocator}` : ""}</td><td>{item.permissionStatus}</td><td>{item.validationStatus}</td><td>{item.items.length}</td></tr>)}{registry.instruments.length === 0 && <tr><td colSpan={6}>尚无量表记录。</td></tr>}</tbody></table></div></div>;
}

export function FiguresCenter({ notify, projectId }: { notify: (message: string) => void; projectId: string }) {
  const [manuscript, setManuscript] = useState<Manuscript | null>(null);
  useEffect(() => { void fetch(`/api/projects/${encodeURIComponent(projectId)}/documents`).then((response) => response.json()).then((result: { documents?: Array<{ manuscript: Manuscript }> }) => setManuscript(result.documents?.[0]?.manuscript ?? null)).catch(() => notify("图表索引加载失败")); }, [notify, projectId]);
  if (!manuscript) return <div className="page-content"><div className="empty-draft">正在加载图表与附录…</div></div>;
  return <div className="page-content doctoral-page"><header className="section-header"><p className="eyebrow">Figures, tables and appendices</p><h1>图表与附录</h1><p>概念图、研究矩阵、PRISMA、样本流程、时间线和附录均登记在稿件对象中；正式结果图表必须连接 AnalysisRun。</p></header><div className="figure-registry-grid"><section className="panel"><div className="panel-title"><Table2 size={17} /><div><h2>Tables</h2><p>{manuscript.tables.length} registered</p></div></div>{manuscript.tables.map((table) => <div className="registry-row" key={table.id}><strong>{table.number}</strong><span>{table.caption}</span><em>{table.status}</em></div>)}</section><section className="panel"><div className="panel-title"><FileOutput size={17} /><div><h2>Figures</h2><p>{manuscript.figures.length} registered</p></div></div>{manuscript.figures.map((figure) => <div className="registry-row" key={figure.id}><strong>{figure.number}</strong><span>{figure.caption}</span><em>{figure.status}</em></div>)}</section><section className="panel"><div className="panel-title"><BookOpen size={17} /><div><h2>Appendices</h2><p>{manuscript.appendices.length} registered</p></div></div>{manuscript.appendices.map((appendix) => <div className="registry-row" key={appendix.id}><strong>{appendix.number}</strong><span>{appendix.title}</span><em>{appendix.status}</em></div>)}</section></div></div>;
}

"use client";

import {
  BadgeCheck,
  Beaker,
  Check,
  ChevronRight,
  CircleAlert,
  CircleHelp,
  ClipboardCheck,
  Download,
  ExternalLink,
  FileCheck2,
  FileOutput,
  FilePenLine,
  FileText,
  FlaskConical,
  Gauge,
  KeyRound,
  Library,
  Menu,
  MessageCircle,
  Network,
  Plus,
  Quote,
  Route,
  Save,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  Table2,
  Wrench,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  ChecklistStatus,
  ConfirmationItem,
  EvidenceStatus,
  PublicModelSettings,
  TaskType,
  WorkspaceData,
  CandidateRecord,
  VerificationEvent,
} from "@/lib/types";
import { citationCoverage, validateClaims } from "@/lib/validation";
import { UserGuide } from "./UserGuide";
import { EvidenceExcerptCenter, FiguresCenter, ManuscriptCenter, MaterialsCenter, OutputsCenter, ResearchPlanCenter, ResultsCenter, ReviewCenter } from "./DoctoralWorkbench";
import { ResearchAssistant } from "./ResearchAssistant";
import type { DoctoralView } from "./DoctoralWorkbench";
import type { ProjectRecord } from "@/lib/portfolio";

type View = "assistant" | "overview" | "confirmation" | "literature" | "theory" | "design" | "novelty" | "writing" | "settings" | "guide" | DoctoralView;

const navItems: { id: View; label: string; icon: typeof Gauge }[] = [
  { id: "assistant", label: "AI研究助手", icon: MessageCircle },
  { id: "overview", label: "总览", icon: Gauge },
  { id: "confirmation", label: "Confirmation", icon: ClipboardCheck },
  { id: "literature", label: "文献证据", icon: Library },
  { id: "theory", label: "理论模型", icon: Network },
  { id: "design", label: "研究设计", icon: FlaskConical },
  { id: "novelty", label: "创新性审查", icon: ShieldCheck },
  { id: "writing", label: "英文写作", icon: FileText },
  { id: "manuscript", label: "稿件中心", icon: FilePenLine },
  { id: "evidence-excerpts", label: "证据摘录", icon: Quote },
  { id: "research-plan", label: "假设与分析", icon: Network },
  { id: "results", label: "数据与结果", icon: Table2 },
  { id: "review", label: "系统综述", icon: Search },
  { id: "materials", label: "材料与量表", icon: Wrench },
  { id: "figures", label: "图表与附录", icon: FileOutput },
  { id: "outputs", label: "输出与检查", icon: FileOutput },
  { id: "settings", label: "模型设置", icon: Settings },
  { id: "guide", label: "使用指南", icon: CircleHelp },
];

const taskOptions: { id: TaskType; label: string; detail: string }[] = [
  { id: "literature_search", label: "文献检索", detail: "检索式与候选发现" },
  { id: "literature_summary", label: "文献综述", detail: "摘要与主题综合" },
  { id: "evidence_verification", label: "证据核验", detail: "元数据与论断复核" },
  { id: "chinese_research_design", label: "中文研究设计", detail: "方法与方案推演" },
  { id: "english_academic_writing", label: "英文学术写作", detail: "正式开题章节" },
  { id: "citation_validation", label: "引用校验", detail: "引用与证据一致性" },
  { id: "translation", label: "翻译", detail: "中英文研究表达" },
  { id: "formatting", label: "格式整理", detail: "结构与样式规范" },
];

const statusTone: Record<ChecklistStatus | EvidenceStatus | string, string> = {
  已满足: "positive",
  进行中: "progress",
  待确认: "warning",
  未开始: "neutral",
  未核验: "warning",
  DOI已核对: "neutral",
  书目信息已核对: "progress",
  摘要已核对: "progress",
  全文已阅读: "positive",
  论断证据已定位: "positive",
  证据充分: "positive",
  证据有限: "warning",
  尚需人工核验: "neutral",
  unverified: "warning",
  verified: "positive",
  partial_match: "warning",
  mismatch: "error",
  failed: "error",
  "书目已核验": "positive",
  "部分匹配，待复核": "warning",
  "信息不匹配": "error",
  "核验失败": "error",
};

const bibliographicLabels: Record<string, string> = { unverified: "未核验", verified: "书目已核验", partial_match: "部分匹配，待复核", mismatch: "信息不匹配", failed: "核验失败" };
function bibliographicStatusLabel(value: string | undefined) { return bibliographicLabels[value ?? "unverified"] ?? "未核验"; }

function StatusBadge({ children }: { children: string }) {
  return <span className={`status ${statusTone[children] ?? "neutral"}`}>{children}</span>;
}

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="section-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

export function Workbench({
  initialData,
  initialSettings,
  projects,
}: {
  initialData: WorkspaceData;
  initialSettings: PublicModelSettings;
  projects: ProjectRecord[];
}) {
  const [data, setData] = useState(initialData);
  const [settings, setSettings] = useState(initialSettings);
  const [view, setView] = useState<View>("assistant");
  const [mobileNav, setMobileNav] = useState(false);
  const [toast, setToast] = useState("");

  function navigate(next: View) {
    setView(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function changeChecklist(id: string, status: ChecklistStatus) {
    const previous = data;
    setData((current) => ({
      ...current,
      confirmation: current.confirmation.map((item) => (item.id === id ? { ...item, status } : item)),
    }));
    const response = await fetch(`/api/checklist?projectId=${encodeURIComponent(data.project.id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (!response.ok) {
      setData(previous);
      notify("保存失败，已恢复原状态");
      return;
    }
    setData(await response.json());
    notify("里程碑状态已保存");
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark"><FileCheck2 size={19} /></div>
          <div>
            <strong>开题证据台</strong>
            <span>Doctoral proposal</span>
          </div>
          <button className="icon-button sidebar-close" onClick={() => setMobileNav(false)} aria-label="关闭导航">
            <X size={18} />
          </button>
        </div>
        <div className="project-switcher"><Link href="/">项目组合</Link><select aria-label="切换研究项目" value={data.project.id} onChange={(event) => { window.location.href = `/?projectId=${encodeURIComponent(event.target.value)}`; }}>{projects.map((project) => <option key={project.id} value={project.id}>{project.titleZh}</option>)}</select></div>
        <nav aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <span>研究版本</span>
          <strong>{data.project.version}</strong>
          <small>最后更新 {new Date(data.updatedAt).toLocaleDateString("zh-CN")}</small>
        </div>
      </aside>

      {mobileNav && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button menu-button" onClick={() => setMobileNav(true)} aria-label="打开导航">
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            <span>{data.project.titleZh.slice(0, 24)}</span>
            <ChevronRight size={14} />
            <strong>{navItems.find((item) => item.id === view)?.label}</strong>
          </div>
          <div className="top-actions">
            <button className="icon-button top-help" onClick={() => navigate("guide")} aria-label="打开使用指南" title="打开使用指南">
              <CircleHelp size={18} />
            </button>
            <Link className="button secondary" href="/"><Route size={16} /> <span>项目组合</span></Link>
            <a className="button primary" href={`/api/projects/${encodeURIComponent(data.project.id)}/exports/bundle`} title="导出当前项目全部文档、参考文献和质量报告"><Download size={16} /> <span>项目ZIP</span></a>
          </div>
        </header>

        <main>
          {view === "assistant" && <ResearchAssistant settings={settings} notify={notify} projectId={data.project.id} />}
          {view === "overview" && <Overview data={data} navigate={navigate} />}
          {view === "confirmation" && <Confirmation data={data} onChange={changeChecklist} />}
          {view === "literature" && <Literature data={data} onData={setData} notify={notify} projectId={data.project.id} />}
          {view === "theory" && <Theory data={data} />}
          {view === "design" && <Design data={data} />}
          {view === "novelty" && <Novelty data={data} notify={notify} projectId={data.project.id} />}
          {view === "writing" && <Writing settings={settings} notify={notify} projectId={data.project.id} />}
          {view === "manuscript" && <ManuscriptCenter notify={notify} projectId={data.project.id} />}
          {view === "evidence-excerpts" && <EvidenceExcerptCenter data={data} notify={notify} projectId={data.project.id} />}
          {view === "research-plan" && <ResearchPlanCenter data={data} notify={notify} projectId={data.project.id} />}
          {view === "results" && <ResultsCenter notify={notify} projectId={data.project.id} />}
          {view === "review" && <ReviewCenter notify={notify} projectId={data.project.id} />}
          {view === "materials" && <MaterialsCenter data={data} notify={notify} projectId={data.project.id} />}
          {view === "figures" && <FiguresCenter notify={notify} projectId={data.project.id} />}
          {view === "outputs" && <OutputsCenter notify={notify} projectId={data.project.id} />}
          {view === "settings" && <ModelSettings settings={settings} setSettings={setSettings} notify={notify} />}
          {view === "guide" && <UserGuide onNavigate={navigate} />}
        </main>
      </div>
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}

function Overview({ data, navigate }: { data: WorkspaceData; navigate: (view: View) => void }) {
  const complete = data.confirmation.filter((item) => item.status === "已满足").length;
  const evidenceReady = data.works.filter((work) => ["全文已阅读", "论断证据已定位"].includes(work.status)).length;
  const issues = validateClaims(data.claims, data.works);

  return (
    <div className="page-content">
      <section className="project-heading">
        <div>
          <div className="project-flags">
            <span>{data.project.field}</span><span>{data.project.citationStyle}</span><span>英文成稿</span>
          </div>
          <h1>{data.project.titleZh}</h1>
          <p>{data.project.titleEn}</p>
        </div>
        <StatusBadge>{`${data.project.version} 设计基线`}</StatusBadge>
      </section>

      <section className="metric-strip" aria-label="研究进度">
        <div><span>Confirmation</span><strong>{complete}/{data.confirmation.length}</strong><small>已满足</small></div>
        <div><span>证据库</span><strong>{data.works.length}</strong><small>种子文献</small></div>
        <div><span>全文证据</span><strong>{evidenceReady}</strong><small>需优先补充</small></div>
        <div><span>引用校验</span><strong>{issues.filter((i) => i.severity === "error").length}</strong><small>阻断项</small></div>
      </section>

      <div className="overview-grid">
        <section className="panel focus-panel">
          <div className="panel-title"><Target size={18} /><div><h2>当前研究边界</h2><p>{data.project.context}</p></div></div>
          <dl className="definition-list">
            <div><dt>研究情境</dt><dd>{data.project.context}</dd></div>
            <div><dt>主要结果</dt><dd>{data.project.primaryOutcome}</dd></div>
            <div><dt>次要结果</dt><dd>{data.project.secondaryOutcome}</dd></div>
            <div><dt>边界条件</dt><dd>{data.constructs.filter((item) => item.role === "调节").map((item) => item.nameZh).join("、") || "待登记"}</dd></div>
          </dl>
        </section>
        <section className="panel next-panel">
          <div className="panel-title"><CircleAlert size={18} /><div><h2>下一决策点</h2><p>进入英文开题前必须完成</p></div></div>
          <ol className="next-list">
            <li><span>01</span><div><strong>补齐量表来源</strong><small>{data.constructs.filter((item) => item.sourceWorkIds.length === 0).slice(0, 3).map((item) => item.nameZh).join("、") || "当前构念来源已登记"}</small></div></li>
            <li><span>02</span><div><strong>锁定最小关心效应</strong><small>再做Monte Carlo功效分析</small></div></li>
            <li><span>03</span><div><strong>指定目标大学</strong><small>校准Confirmation与伦理路径</small></div></li>
          </ol>
        </section>
      </div>

      <section className="band-section">
        <div className="band-heading"><div><p className="eyebrow">Research workflow</p><h2>研究推进路径</h2></div></div>
        <div className="workflow">
          {[
            ["01", "系统检索", "建立可复现检索日志", "literature" as View],
            ["02", "理论与构念", "登记理论来源和测量边界", "theory" as View],
            ...data.experiments.slice(0, 2).map((experiment, index) => [String(index + 3).padStart(2, "0"), experiment.name, experiment.objective, "design" as View]),
          ].map(([number, title, text, target]) => (
            <button key={number} onClick={() => navigate(target as View)}>
              <span>{number}</span><strong>{title}</strong><small>{text}</small><ChevronRight size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function Confirmation({ data, onChange }: { data: WorkspaceData; onChange: (id: string, status: ChecklistStatus) => void }) {
  const grouped = data.confirmation.reduce<Record<string, ConfirmationItem[]>>((result, item) => {
    (result[item.category] ??= []).push(item);
    return result;
  }, {});
  const complete = data.confirmation.filter((item) => item.status === "已满足").length;
  const percent = Math.round((complete / data.confirmation.length) * 100);

  return (
    <div className="page-content">
      <SectionHeader eyebrow="Australian candidature" title="Confirmation准备矩阵" description="澳洲通用严格基线；目标大学确定后，用官方院校要求覆盖。" />
      <div className="progress-panel">
        <div><strong>{percent}%</strong><span>已满足 {complete} / {data.confirmation.length}</span></div>
        <div className="progress-track"><span style={{ width: `${percent}%` }} /></div>
        <p><CircleAlert size={15} /> “待确认”表示需要院校官方来源，不代表要求已满足。</p>
      </div>
      <div className="checklist-groups">
        {Object.entries(grouped).map(([category, items]) => (
          <section key={category} className="check-group">
            <h2>{category}<span>{items.length}</span></h2>
            {items.map((item) => (
              <div className="check-row" key={item.id}>
                <div className={`check-icon ${item.status === "已满足" ? "done" : ""}`}>
                  {item.status === "已满足" ? <Check size={15} /> : <span />}
                </div>
                <div><strong>{item.title}</strong><p>{item.evidence}</p></div>
                <select value={item.status} onChange={(event) => onChange(item.id, event.target.value as ChecklistStatus)} aria-label={`${item.title}状态`}>
                  {(["未开始", "进行中", "已满足", "待确认"] as ChecklistStatus[]).map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

type RemoteWork = { id: string; title: string; year: number; doi?: string; citations: number; authors: string; venue: string; status: string };

function Literature({ data, onData, notify, projectId }: { data: WorkspaceData; onData: (data: WorkspaceData) => void; notify: (message: string) => void; projectId: string }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("全部");
  const [remote, setRemote] = useState<RemoteWork[]>([]);
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [verificationEvents, setVerificationEvents] = useState<VerificationEvent[]>([]);
  const [searching, setSearching] = useState(false);
  const groups = ["全部", ...Array.from(new Set(data.works.map((work) => work.group)))];
  const filtered = useMemo(() => data.works.filter((work) => {
    const matchesGroup = group === "全部" || work.group === group;
    const haystack = `${work.authors} ${work.title} ${work.venue} ${work.doi ?? ""}`.toLowerCase();
    return matchesGroup && haystack.includes(query.toLowerCase());
  }), [data.works, group, query]);

  const loadCandidates = useCallback(async () => {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/candidates`);
    if (!response.ok) return;
    const result = await response.json() as { candidates?: CandidateRecord[]; verificationEvents?: VerificationEvent[] };
    setCandidates(result.candidates ?? []);
    setVerificationEvents(result.verificationEvents ?? []);
  }, [projectId]);

  useEffect(() => { void loadCandidates(); }, [loadCandidates]);

  async function searchOpenAlex() {
    if (query.trim().length < 3) return notify("请输入至少3个字符的检索词");
    setSearching(true);
    const response = await fetch(`/api/literature/search?q=${encodeURIComponent(query)}`);
    const result = await response.json();
    setSearching(false);
    if (!response.ok) return notify(result.error ?? "OpenAlex检索失败");
    setRemote(result.results);
    notify(`OpenAlex返回 ${result.results.length} 条候选记录`);
  }

  async function importCandidate(work: RemoteWork) {
    const response = await fetch(`/api/literature/import?projectId=${encodeURIComponent(projectId)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: work.title, authors: work.authors, year: work.year, venue: work.venue, doi: work.doi, relevance: "OpenAlex候选记录；待人工评估、摘要和全文核验。" }),
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error ?? "导入失败");
    if (result.workspace) onData(result.workspace);
    await loadCandidates();
    notify("候选文献已保存为“仅发现，未核验”；完成书目核验后才能进入正式引用");
  }

  return (
    <div className="page-content">
      <SectionHeader eyebrow="Evidence library" title="文献与证据库" description="元数据核验不等于全文支持；每篇文献保留独立的核验状态。" />
      <div className="toolbar">
        <label className="search-field"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="检索标题、作者、DOI" onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchOpenAlex(); } }} /></label>
        <div className="segmented" aria-label="文献分组">
          {groups.map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item)}>{item}</button>)}
        </div>
        <button className="button secondary" onClick={searchOpenAlex} disabled={searching}><Search size={16} />{searching ? "检索中" : "检索OpenAlex"}</button>
        <span className="result-count">本地 {filtered.length} 篇</span>
      </div>
      {remote.length > 0 && <div className="table-shell" style={{ marginTop: 18 }}>
        <table>
          <thead><tr><th>OpenAlex候选记录</th><th>被引</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{remote.map((work) => <tr key={work.id}><td className="work-cell"><strong>{work.title}</strong><span>{work.authors || "作者信息缺失"} ({work.year})</span><small>{work.venue || "来源信息缺失"}{work.doi ? ` · ${work.doi}` : ""}</small></td><td>{work.citations}</td><td><span className="plain-tag">未核验</span></td><td><button className="button secondary" onClick={() => importCandidate(work)}>加入证据库</button></td></tr>)}</tbody>
        </table>
      </div>}
      {candidates.length > 0 && <section className="table-shell" style={{ marginTop: 18 }} aria-label="候选文献">
        <table>
          <thead><tr><th>候选文献</th><th>来源</th><th>状态</th><th>最近核验</th><th>操作</th></tr></thead>
          <tbody>{candidates.map((candidate) => {
            const event = verificationEvents.find((item) => item.candidateId === candidate.id);
            return <tr key={candidate.id}><td className="work-cell"><strong>{candidate.title}</strong><span>{candidate.authors.join("; ") || "作者信息缺失"}{candidate.year ? ` (${candidate.year})` : ""}</span><small>{candidate.venue || "来源信息缺失"}{candidate.doi ? ` · ${candidate.doi}` : ""}</small></td><td>{candidate.provider}</td><td><StatusBadge>{candidate.status === "promoted" ? "已升级 Work" : "仅发现，未核验"}</StatusBadge></td><td>{event ? `${bibliographicStatusLabel(event.result)} · ${new Date(event.checkedAt).toLocaleDateString()}` : "尚未执行 VerificationEvent"}</td><td>{candidate.doi && candidate.status !== "promoted" && <button className="button secondary" onClick={async () => { const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/candidates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ candidateId: candidate.id }) }); const result = await response.json(); await loadCandidates(); notify(response.ok ? `核验结果：${bibliographicStatusLabel(result.event?.result)}` : `核验未通过：${bibliographicStatusLabel(result.event?.result)}${result.error ? `，${result.error}` : ""}`); }}>核验书目</button>}</td></tr>;
          })}</tbody>
        </table>
      </section>}
      <div className="table-shell">
        <table>
          <thead><tr><th>文献</th><th>分组</th><th>核验状态</th><th>研究用途</th><th><span className="sr-only">链接</span></th></tr></thead>
          <tbody>
            {filtered.map((work) => {
              const event = verificationEvents.find((item) => item.workId === work.id);
              return <tr key={work.id}>
                <td className="work-cell"><strong>{work.title}</strong><span>{work.authors} ({work.year})</span><small>{work.venue}</small></td>
                <td><span className="plain-tag">{work.group}</span></td>
                <td><StatusBadge>{bibliographicStatusLabel(work.bibliographicStatus)}</StatusBadge><small>{event ? `${bibliographicStatusLabel(event.result)} · ${new Date(event.checkedAt).toLocaleDateString()}` : "尚无 VerificationEvent"}</small></td>
                <td className="relevance">{work.relevance}</td>
                <td>{work.doi && <a className="icon-link" href={`https://doi.org/${work.doi}`} target="_blank" rel="noreferrer" title={`打开 DOI ${work.doi}`}><ExternalLink size={16} /></a>}</td>
              </tr>
            })}
          </tbody>
        </table>
      </div>
      <div className="notice"><CircleAlert size={17} /><div><strong>证据边界</strong><p>当前为种子库，不是完整系统综述。必须通过商科数据库扩展检索，并记录检索式、日期、筛选与排除理由。</p></div></div>
    </div>
  );
}

function Theory({ data }: { data: WorkspaceData }) {
  const stimulus = data.constructs.find((item) => item.role === "刺激");
  const mechanism = data.constructs.find((item) => item.role === "中介");
  const response = data.constructs.find((item) => item.role === "结果");
  const moderators = data.constructs.filter((item) => item.role === "调节");
  return (
    <div className="page-content">
      <SectionHeader eyebrow="Theory registry" title="理论与构念映射" description="每个理论说明用途和边界；没有来源的测量项会保留为待核验。" />
      <div className="theory-layout">
        <div className="theory-stack">
          {data.theories.map((theory) => (
            <article key={theory.id} className="theory-item">
              <div><span className="theory-role">{theory.role}</span><h2>{theory.name}</h2></div>
              <p>{theory.use}</p>
              <small><CircleAlert size={14} /> 边界：{theory.boundary}</small>
              <div className="source-ids">{theory.sourceWorkIds.length ? theory.sourceWorkIds.map((id) => <span key={id}>{id}</span>) : <span className="missing">缺少来源</span>}</div>
            </article>
          ))}
        </div>
        <div className="model-panel">
          <p className="eyebrow">Primary model</p>
          <h2>核心因果链</h2>
          <div className="model-flow">
            <div><span>Stimulus</span><strong>{stimulus?.nameZh ?? "待登记"}</strong></div><ChevronRight />
            <div><span>Mechanism</span><strong>{mechanism?.nameZh ?? "待登记"}</strong></div><ChevronRight />
            <div><span>Response</span><strong>{response?.nameZh ?? data.project.primaryOutcome}</strong></div>
          </div>
          <p className="moderator"><Sparkles size={15} /> 边界条件：{moderators.map((item) => item.nameZh).join("、") || "待登记"}</p>
        </div>
      </div>
      <section className="band-section">
        <div className="band-heading"><div><p className="eyebrow">Construct registry</p><h2>构念登记</h2></div><span>{data.constructs.length} 个构念</span></div>
        <div className="construct-grid">
          {data.constructs.map((construct) => (
            <article key={construct.id}>
              <div><StatusBadge>{construct.role}</StatusBadge><span>{data.theories.find((t) => t.id === construct.theoryId)?.name}</span></div>
              <h3>{construct.nameZh}</h3><strong>{construct.nameEn}</strong>
              <p>{construct.definition}</p>
              <small className={construct.sourceWorkIds.length === 0 ? "needs-source" : ""}>{construct.measurement}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Design({ data }: { data: WorkspaceData }) {
  return (
    <div className="page-content">
      <SectionHeader eyebrow="Sequential research design" title={`${data.experiments.length} 项已登记研究`} description="每项研究独立记录目标、设计、条件、主要估计量和伦理边界。" />
      <div className="experiment-timeline">
        {data.experiments.map((experiment, index) => (
          <article className="experiment" key={experiment.id}>
            <div className="experiment-index"><span>0{index + 1}</span><div /></div>
            <div className="experiment-body">
              <header><div><span>{experiment.design}</span><h2>{experiment.name}</h2></div><Beaker size={22} /></header>
              <p className="objective">{experiment.objective}</p>
              <div className="design-grid">
                <div><h3>实验条件</h3><ul>{experiment.conditions.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <div><h3>保持一致</h3><ul>{experiment.constants.map((item) => <li key={item}>{item}</li>)}</ul></div>
              </div>
              <div className="primary-test"><Target size={17} /><div><span>主要检验</span><strong>{experiment.primaryTest}</strong></div></div>
              <div className="ethics"><ShieldCheck size={16} />{experiment.ethics}</div>
            </div>
          </article>
        ))}
      </div>
      <div className="method-gates">
        <div><span>Gate 1</span><strong>刺激预试</strong><p>控制事实、长度、信息量和语言质量；使用多个商品刺激。</p></div>
        <div><span>Gate 2</span><strong>测量验证</strong><p>认知访谈、情境改写、信效度和测量不变性。</p></div>
        <div><span>Gate 3</span><strong>功效分析</strong><p>根据主要交互与间接效应做Monte Carlo模拟。</p></div>
      </div>
    </div>
  );
}

function Novelty({ data, notify, projectId }: { data: WorkspaceData; notify: (message: string) => void; projectId: string }) {
  const issues = validateClaims(data.claims, data.works);
  const coverage = citationCoverage(data.claims);
  async function validate() {
    const response = await fetch(`/api/validate?projectId=${encodeURIComponent(projectId)}`);
    const result = await response.json();
    notify(result.valid ? "引用完整性检查通过" : `发现 ${result.issues.length} 个引用问题`);
  }

  return (
    <div className="page-content">
      <SectionHeader eyebrow="Auditable novelty evidence" title="创新性与论断审查" description="这里提供可复核的新颖性证据，不输出“全球没有相同研究”的保证。" />
      <div className="validation-strip">
        <div><BadgeCheck size={20} /><span>事实引用覆盖率</span><strong>{coverage}%</strong></div>
        <div><CircleAlert size={20} /><span>校验提示</span><strong>{issues.length}</strong></div>
        <button className="button primary" onClick={validate}><ShieldCheck size={16} />运行引用校验</button>
      </div>
      <div className="table-shell novelty-table">
        <table>
          <thead><tr><th>维度</th><th>已有研究</th><th>拟研究贡献</th><th>判断</th></tr></thead>
          <tbody>{data.novelty.map((item) => <tr key={item.dimension}><td><strong>{item.dimension}</strong></td><td>{item.existing}</td><td>{item.proposed}</td><td><StatusBadge>{item.assessment}</StatusBadge></td></tr>)}</tbody>
        </table>
      </div>
      <section className="claims-section">
        <div className="band-heading"><div><p className="eyebrow">Claim register</p><h2>论断登记</h2></div></div>
        {data.claims.map((claim) => {
          const claimIssues = issues.filter((issue) => issue.claimId === claim.id);
          return <article key={claim.id} className="claim-row">
            <StatusBadge>{claim.kind}</StatusBadge>
            <div><strong>{claim.text}</strong><small>{claim.location} · {claim.citationIds.length ? `证据 ${claim.citationIds.join(", ")}` : "无外部引用"}</small></div>
            <span className={claimIssues.some((issue) => issue.severity === "error") ? "claim-error" : "claim-ok"}>{claimIssues.length ? `${claimIssues.length} 提示` : "规则通过"}</span>
          </article>;
        })}
      </section>
    </div>
  );
}

type SettingsProfile = PublicModelSettings["profiles"][number];
type SettingsRoute = PublicModelSettings["routes"][number];

type GenerationAttempt = {
  profileId: string;
  profileName: string;
  provider: string;
  model: string;
  status: "succeeded" | "failed";
  errorCategory?: string;
  httpStatus?: number;
  elapsedMs: number;
};

type GenerationProfile = {
  id: string;
  name: string;
  provider: string;
  model: string;
};

type GenerationRun = {
  profile?: GenerationProfile;
  attempts: GenerationAttempt[];
};

function cloneSettings(settings: PublicModelSettings): PublicModelSettings {
  const routes = taskOptions.map(({ id }) => {
    const route = settings.routes.find((item) => item.taskType === id);
    return route
      ? { ...route, fallbackProfileIds: [...route.fallbackProfileIds] }
      : { taskType: id, defaultProfileId: null, fallbackProfileIds: [] };
  });
  return { profiles: settings.profiles.map((profile) => ({ ...profile })), routes, allowFullText: settings.allowFullText };
}

function orderedProfileIds(ids: string[], profiles: SettingsProfile[]) {
  const priority = new Map(profiles.map((profile) => [profile.id, profile.priority]));
  return Array.from(new Set(ids)).sort((left, right) => (priority.get(left) ?? Number.MAX_SAFE_INTEGER) - (priority.get(right) ?? Number.MAX_SAFE_INTEGER));
}

function routedProfiles(settings: PublicModelSettings, taskType: TaskType, explicitProfileId?: string) {
  const enabled = new Map(settings.profiles.filter((profile) => profile.enabled).map((profile) => [profile.id, profile]));
  const route = settings.routes.find((item) => item.taskType === taskType);
  const ids = [
    ...(explicitProfileId ? [explicitProfileId] : []),
    ...(route?.defaultProfileId ? [route.defaultProfileId] : []),
    ...orderedProfileIds(route?.fallbackProfileIds ?? [], settings.profiles),
  ];
  return Array.from(new Set(ids)).flatMap((id) => {
    const profile = enabled.get(id);
    return profile ? [profile] : [];
  });
}

function createProfileId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `model-${uuid}`;
  return `model-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function ModelSettings({ settings, setSettings, notify }: { settings: PublicModelSettings; setSettings: (settings: PublicModelSettings) => void; notify: (message: string) => void }) {
  const [draftSettings, setDraftSettings] = useState(() => cloneSettings(settings));
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testingProfileId, setTestingProfileId] = useState<string | null>(null);

  function updateProfile(id: string, patch: Partial<SettingsProfile>) {
    setDraftSettings((current) => ({
      ...current,
      profiles: current.profiles.map((profile) => profile.id === id ? { ...profile, ...patch } : profile),
    }));
  }

  function addProfile() {
    const index = draftSettings.profiles.length + 1;
    const maxPriority = draftSettings.profiles.reduce((maximum, profile) => Math.max(maximum, profile.priority), 0);
    const profile: SettingsProfile = {
      id: createProfileId(),
      name: `Model ${index}`,
      provider: "OpenAI-compatible",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5-mini",
      apiKeyRef: `MODEL_PROFILE_${index}_API_KEY`,
      enabled: true,
      priority: maxPriority + 100,
      notes: "",
      hasApiKey: false,
    };
    setDraftSettings((current) => ({ ...current, profiles: [...current.profiles, profile] }));
  }

  function removeProfile(profile: SettingsProfile) {
    if (!window.confirm(`移除模型配置“${profile.name}”？相关任务路由也会同步清理。`)) return;
    setSecretInputs((current) => {
      const next = { ...current };
      delete next[profile.id];
      return next;
    });
    setDraftSettings((current) => ({
      ...current,
      profiles: current.profiles.filter((item) => item.id !== profile.id),
      routes: current.routes.map((route) => ({
        ...route,
        defaultProfileId: route.defaultProfileId === profile.id ? null : route.defaultProfileId,
        fallbackProfileIds: route.fallbackProfileIds.filter((id) => id !== profile.id),
      })),
    }));
  }

  function updateRoute(taskType: TaskType, patch: Partial<SettingsRoute>) {
    setDraftSettings((current) => ({
      ...current,
      routes: current.routes.map((route) => route.taskType === taskType ? { ...route, ...patch } : route),
    }));
  }

  function toggleFallback(route: SettingsRoute, profileId: string) {
    const selected = route.fallbackProfileIds.includes(profileId);
    const ids = selected
      ? route.fallbackProfileIds.filter((id) => id !== profileId)
      : [...route.fallbackProfileIds, profileId];
    updateRoute(route.taskType, { fallbackProfileIds: orderedProfileIds(ids, draftSettings.profiles) });
  }

  function profileIsSaved(profile: SettingsProfile) {
    const saved = settings.profiles.find((item) => item.id === profile.id);
    if (!saved) return false;
    return saved.name === profile.name
      && saved.provider === profile.provider
      && saved.baseUrl === profile.baseUrl
      && saved.model === profile.model
      && saved.apiKeyRef === profile.apiKeyRef
      && saved.enabled === profile.enabled
      && saved.priority === profile.priority
      && saved.notes === profile.notes;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = {
      profiles: draftSettings.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        provider: profile.provider,
        baseUrl: profile.baseUrl,
        model: profile.model,
        apiKeyRef: profile.apiKeyRef,
        enabled: profile.enabled,
        priority: profile.priority,
        notes: profile.notes,
      })),
      routes: draftSettings.routes.map((route) => ({
        ...route,
        fallbackProfileIds: orderedProfileIds(
          route.fallbackProfileIds.filter((id) => id !== route.defaultProfileId),
          draftSettings.profiles,
        ),
      })),
      allowFullText: draftSettings.allowFullText,
    };
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as PublicModelSettings & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "设置保存失败");

      for (const [profileId, apiKey] of Object.entries(secretInputs)) {
        if (!apiKey || !draftSettings.profiles.some((profile) => profile.id === profileId)) continue;
        const secretResponse = await fetch("/api/secrets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileId, apiKey }),
        });
        const secretResult = await secretResponse.json() as { error?: string };
        if (!secretResponse.ok) throw new Error(secretResult.error ?? "API Key保存失败");
      }

      const refreshedResponse = await fetch("/api/settings");
      const refreshed = await refreshedResponse.json() as PublicModelSettings & { error?: string };
      if (!refreshedResponse.ok) throw new Error(refreshed.error ?? "无法刷新模型设置");
      const saved = cloneSettings(refreshed);
      setSettings(saved);
      setDraftSettings(saved);
      setSecretInputs({});
      notify("模型、路由和密钥设置已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : "设置保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function testConnection(profile: SettingsProfile) {
    setTestingProfileId(profile.id);
    const response = await fetch("/api/llm/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profileId: profile.id }),
    });
    const result = await response.json() as { message?: string; error?: string };
    setTestingProfileId(null);
    notify(result.message ?? result.error ?? (response.ok ? "连接成功" : "连接失败"));
  }

  const profilesByPriority = [...draftSettings.profiles].sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));

  return (
    <div className="page-content settings-page model-settings-page">
      <SectionHeader eyebrow="Multi-model routing" title="模型配置与任务路由" description="环境变量引用与直接密钥分开配置；密钥内容不会由服务端返回浏览器。" />
      <form className="settings-form" onSubmit={submit}>
        <section className="form-section profile-section">
          <div className="form-section-title section-title-actions">
            <Server size={19} />
            <div><h2>模型配置</h2><p>{draftSettings.profiles.length} 个端点 · 数字越小优先级越高</p></div>
            <button type="button" className="button secondary" onClick={addProfile}><Plus size={16} />新增模型</button>
          </div>
          <div className="profile-list">
            {profilesByPriority.map((profile) => {
              const saved = profileIsSaved(profile);
              return (
                <article className={`profile-card ${profile.enabled ? "" : "disabled"}`} key={profile.id}>
                  <header className="profile-card-header">
                    <label className="compact-toggle">
                      <input type="checkbox" checked={profile.enabled} onChange={(event) => updateProfile(profile.id, { enabled: event.target.checked })} />
                      <i />
                      <span>{profile.enabled ? "已启用" : "已停用"}</span>
                    </label>
                    <div className="profile-identity">
                      <strong>{profile.name || "未命名模型"}</strong>
                      <span>{profile.provider} · {profile.model}</span>
                    </div>
                    <span className={`key-state ${profile.hasApiKey ? "ready" : "missing"}`}><KeyRound size={13} />{profile.hasApiKey ? "密钥可用" : "密钥缺失"}</span>
                    <div className="profile-actions">
                      <button type="button" className="button secondary" onClick={() => testConnection(profile)} disabled={testingProfileId !== null || !saved} title={saved ? "测试此模型端点" : "保存配置后测试"}>
                        <FlaskConical size={15} />{testingProfileId === profile.id ? "测试中" : "测试"}
                      </button>
                      <button type="button" className="icon-button danger" onClick={() => removeProfile(profile)} title={`移除 ${profile.name}`} aria-label={`移除 ${profile.name}`}><Trash2 size={17} /></button>
                    </div>
                  </header>
                  <div className="profile-fields">
                    <label><span>显示名称</span><input type="text" value={profile.name} onChange={(event) => updateProfile(profile.id, { name: event.target.value })} required /></label>
                    <label><span>服务商</span><input type="text" value={profile.provider} onChange={(event) => updateProfile(profile.id, { provider: event.target.value })} required /></label>
                    <label><span>优先级</span><input type="number" min="0" max="100000" value={profile.priority} onChange={(event) => updateProfile(profile.id, { priority: Number(event.target.value) })} required /></label>
                    <label className="wide"><span>Base URL</span><input type="url" value={profile.baseUrl} onChange={(event) => updateProfile(profile.id, { baseUrl: event.target.value })} required /></label>
                    <label><span>模型名称</span><input type="text" value={profile.model} onChange={(event) => updateProfile(profile.id, { model: event.target.value })} required /></label>
                    <label className="wide"><span>密钥引用名（环境变量）</span><div className="input-with-icon"><KeyRound size={15} /><input type="text" value={profile.apiKeyRef} pattern="[A-Z][A-Z0-9_]*" placeholder="MODEL_WRITER_KEY" onChange={(event) => updateProfile(profile.id, { apiKeyRef: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "") })} required /></div><small className="field-help">这里只填写大写引用名，不要粘贴真实密钥。</small></label>
                    <label className="full"><span>API Key（可选，直接粘贴，区分大小写）</span><div className="input-with-icon"><KeyRound size={15} /><input type="password" value={secretInputs[profile.id] ?? ""} placeholder={profile.hasApiKey ? "已配置；留空保持不变" : "粘贴完整密钥，例如 sk-..."} autoComplete="new-password" onChange={(event) => setSecretInputs((current) => ({ ...current, [profile.id]: event.target.value }))} /></div><small className="field-help">此字段完整保留大小写、连字符和符号；保存后立即清空且不会回显。</small></label>
                    <label className="full"><span>备注</span><textarea value={profile.notes} onChange={(event) => updateProfile(profile.id, { notes: event.target.value })} rows={2} maxLength={2000} /></label>
                  </div>
                </article>
              );
            })}
            {draftSettings.profiles.length === 0 && <div className="empty-profile"><Server size={21} /><span>尚未配置模型</span><button type="button" className="button secondary" onClick={addProfile}><Plus size={16} />新增模型</button></div>}
          </div>
        </section>

        <section className="form-section route-section">
          <div className="form-section-title"><Route size={19} /><div><h2>任务路由</h2><p>默认模型先执行，失败后按配置优先级尝试所选后备模型</p></div></div>
          <div className="route-list">
            {taskOptions.map((task) => {
              const route = draftSettings.routes.find((item) => item.taskType === task.id)!;
              const fallbackProfiles = profilesByPriority.filter((profile) => profile.id !== route.defaultProfileId);
              return (
                <article className="route-row" key={task.id}>
                  <div className="route-name"><strong>{task.label}</strong><span>{task.detail}</span><code>{task.id}</code></div>
                  <label className="route-default"><span>默认模型</span><select value={route.defaultProfileId ?? ""} onChange={(event) => updateRoute(task.id, { defaultProfileId: event.target.value || null, fallbackProfileIds: route.fallbackProfileIds.filter((id) => id !== event.target.value) })}>
                    <option value="">未指定</option>
                    {profilesByPriority.map((profile) => <option key={profile.id} value={profile.id} disabled={!profile.enabled}>{profile.name}{profile.enabled ? "" : "（已停用）"}</option>)}
                  </select></label>
                  <fieldset className="fallback-fieldset">
                    <legend>后备模型</legend>
                    <div className="fallback-options">
                      {fallbackProfiles.map((profile) => {
                        const selected = route.fallbackProfileIds.includes(profile.id);
                        const order = orderedProfileIds(route.fallbackProfileIds, draftSettings.profiles).indexOf(profile.id) + 1;
                        return <label className={`${selected ? "selected" : ""} ${profile.enabled ? "" : "disabled"}`} key={profile.id}>
                          <input type="checkbox" checked={selected} onChange={() => toggleFallback(route, profile.id)} />
                          <span className="fallback-check">{selected ? <Check size={12} /> : null}</span>
                          <span>{profile.name}</span>
                          {selected && <small>#{order}</small>}
                        </label>;
                      })}
                      {fallbackProfiles.length === 0 && <span className="route-empty">无可选后备模型</span>}
                    </div>
                  </fieldset>
                </article>
              );
            })}
          </div>
        </section>

        <section className="form-section privacy-section">
          <div className="form-section-title"><ShieldCheck size={19} /><div><h2>全文隐私</h2><p>适用于所有模型配置和任务路由</p></div></div>
          <label className="toggle-row"><div><strong>允许发送文献全文</strong><span>关闭时仅发送用户选择的元数据与证据摘录</span></div><input type="checkbox" checked={draftSettings.allowFullText} onChange={(event) => setDraftSettings((current) => ({ ...current, allowFullText: event.target.checked }))} /><i /></label>
          <div className="security-note"><BadgeCheck size={17} /><p>直接密钥只在提交期间存在于表单内存，并写入权限为当前用户可读的本地密钥文件；服务端响应、审计和导出不会包含密钥内容。</p></div>
        </section>
        <div className="form-actions settings-save-bar">
          <span>{draftSettings.profiles.filter((profile) => profile.enabled).length} 个模型已启用</span>
          <button type="submit" className="button primary" disabled={saving}><Save size={16} />{saving ? "保存中" : "保存全部设置"}</button>
        </div>
      </form>
    </div>
  );
}

function attemptLabel(attempt: GenerationAttempt) {
  if (attempt.status === "succeeded") return "成功";
  const labels: Record<string, string> = {
    missing_api_key: "密钥缺失",
    authentication: "认证失败",
    permission: "权限不足",
    rate_limit: "请求限流",
    invalid_request: "请求无效",
    not_found: "端点不存在",
    timeout: "连接超时",
    network: "网络错误",
    provider_unavailable: "服务不可用",
    invalid_response: "响应无效",
    unknown: "未知错误",
  };
  return labels[attempt.errorCategory ?? "unknown"] ?? attempt.errorCategory ?? "失败";
}

function Writing({ settings, notify, projectId }: { settings: PublicModelSettings; notify: (message: string) => void; projectId: string }) {
  const taskType: TaskType = "english_academic_writing";
  const [section, setSection] = useState("methods");
  const [profileId, setProfileId] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [generationRun, setGenerationRun] = useState<GenerationRun | null>(null);
  const enabledProfiles = [...settings.profiles].filter((profile) => profile.enabled).sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name));
  const candidates = routedProfiles(settings, taskType, profileId || undefined);
  const predicted = candidates.find((profile) => profile.hasApiKey) ?? candidates[0];

  async function generate() {
    setGenerating(true);
    setGenerationRun(null);
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId, section, taskType, ...(profileId ? { profileId } : {}) }),
    });
    const result = await response.json() as {
      draft?: string;
      error?: string;
      usedProfile?: GenerationProfile;
      attempts?: GenerationAttempt[];
    };
    setGenerating(false);
    setGenerationRun({ profile: result.usedProfile, attempts: result.attempts ?? [] });
    if (!response.ok || !result.draft) return notify(result.error ?? "生成失败");
    setDraft(result.draft);
    notify("英文草稿已生成；仍需研究者逐句审核");
  }

  return (
    <div className="page-content settings-page writing-page">
      <SectionHeader eyebrow="Evidence-gated writing" title="英文开题写作" description="任务固定路由至英文学术写作模型；可为本次生成选择一次性覆盖。" />
      <section className="panel writing-control-panel">
        <div className="panel-title"><FileText size={18} /><div><h2>生成章节草稿</h2><p>模型不能自由创建引用，库外引用会被服务端拦截。</p></div></div>
        <div className="writing-fields">
          <label><span>英文章节</span><select value={section} onChange={(event) => setSection(event.target.value)}>
            <option value="methods">Methodology</option>
            <option value="background">Research Background</option>
            <option value="literature_review">Critical Literature Review</option>
            <option value="theory">Theoretical Framework</option>
            <option value="contribution">Expected Contribution</option>
            <option value="results">Results (requires completed real AnalysisRun)</option>
          </select></label>
          <label><span>任务类型</span><div className="readonly-field"><Route size={14} />english_academic_writing</div></label>
          <label><span>本次模型</span><select value={profileId} onChange={(event) => setProfileId(event.target.value)}>
            <option value="">使用任务路由</option>
            {enabledProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}
          </select></label>
        </div>
        <div className={`route-preview ${predicted?.hasApiKey ? "ready" : "warning"}`}>
          <Server size={18} />
          <div><span>预测执行模型</span><strong>{predicted ? `${predicted.name} · ${predicted.model}` : "当前路由没有可用模型"}</strong></div>
          {candidates.length > 0 && <small>{candidates.map((profile) => profile.name).join(" → ")}</small>}
        </div>
        <div className="writing-actions"><button className="button primary" onClick={generate} disabled={generating || candidates.length === 0}><Sparkles size={16} />{generating ? "生成中" : "生成英文草稿"}</button></div>
      </section>

      {generationRun && <section className="routing-result" aria-live="polite">
        <header><div><p className="eyebrow">Routing result</p><h2>{generationRun.profile ? "模型调用完成" : "模型调用未完成"}</h2></div>{generationRun.profile && <span><BadgeCheck size={15} />{generationRun.profile.name} · {generationRun.profile.model}</span>}</header>
        <div className="attempt-list">
          {generationRun.attempts.map((attempt, index) => <div className={attempt.status} key={`${attempt.profileId}-${index}`}>
            <span className="attempt-index">{index + 1}</span>
            <div><strong>{attempt.profileName}</strong><small>{attempt.provider} · {attempt.model}</small></div>
            <span className="attempt-status">{attemptLabel(attempt)}{attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}</span>
            <time>{attempt.elapsedMs} ms</time>
          </div>)}
          {generationRun.attempts.length === 0 && <div className="no-attempts">服务端未返回模型尝试记录。</div>}
        </div>
      </section>}

      <section className="panel draft-panel">
        <div className="panel-title"><FileText size={18} /><div><h2>Draft</h2><p>此处内容不是最终论文，导出前必须完成证据与语言审核。</p></div></div>
        {draft ? <textarea className="draft-output" readOnly value={draft} aria-label="英文草稿" /> : <div className="empty-draft">尚未生成。模型设置不会影响其他研究管理功能。</div>}
      </section>
    </div>
  );
}

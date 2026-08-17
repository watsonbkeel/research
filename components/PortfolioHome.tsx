"use client";

import { ArrowRight, Check, FolderKanban, LoaderCircle, Plus, Sparkles } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ProjectRecord, TopicBatch, TopicCandidate } from "@/lib/portfolio";

type BatchDetail = TopicBatch & { candidates: TopicCandidate[] };
const scoreLabels: Record<string, string> = { overall: "综合排名", significance: "研究意义", noveltyEvidence: "创新证据", theoreticalCoherence: "理论一致", testability: "可检验性", feasibility: "可行性", publicationPotential: "论文潜力" };

export function PortfolioHome({ initialProjects, initialBatches }: { initialProjects: ProjectRecord[]; initialBatches: TopicBatch[] }) {
  const [projects, setProjects] = useState(initialProjects);
  const [batches, setBatches] = useState(initialBatches);
  const [details, setDetails] = useState<Record<string, BatchDetail>>({});
  const [mode, setMode] = useState<"expand" | "evaluate-only">("expand");
  const [brief, setBrief] = useState("");
  const [seedTopics, setSeedTopics] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeBatch = useMemo(() => batches.find((batch) => ["queued", "running"].includes(batch.status)), [batches]);

  async function loadBatch(id: string) {
    const response = await fetch(`/api/topic-batches/${encodeURIComponent(id)}`); if (!response.ok) return;
    const payload = await response.json() as { batch: TopicBatch; candidates: TopicCandidate[] };
    setDetails((current) => ({ ...current, [id]: { ...payload.batch, candidates: payload.candidates } }));
    setBatches((current) => current.map((batch) => batch.id === id ? payload.batch : batch));
  }

  useEffect(() => { for (const batch of batches.slice(0, 5)) void loadBatch(batch.id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!activeBatch) return; const timer = window.setInterval(() => void loadBatch(activeBatch.id), 3500); return () => window.clearInterval(timer); }, [activeBatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function createBatch(event: FormEvent) {
    event.preventDefault(); if (!brief.trim() || submitting) return; setSubmitting(true);
    const seeds = seedTopics.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    const response = await fetch("/api/topic-batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ inputMode: mode, brief: brief.trim(), requestedCount: 5, seedTopics: seeds }) });
    const result = await response.json() as { batch?: TopicBatch; error?: string }; setSubmitting(false);
    if (!response.ok || !result.batch) return window.alert(result.error ?? "候选主题任务创建失败");
    setBatches((current) => [result.batch!, ...current]); setBrief(""); setSeedTopics(""); void loadBatch(result.batch.id);
  }

  async function promote(candidate: TopicCandidate) {
    const response = await fetch(`/api/topic-batches/${encodeURIComponent(candidate.batchId)}/candidates/${encodeURIComponent(candidate.id)}/promote`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const result = await response.json() as { project?: ProjectRecord; error?: string };
    if (!response.ok || !result.project) return window.alert(result.error ?? "立项失败");
    setProjects((current) => current.some((item) => item.id === result.project!.id) ? current : [result.project!, ...current]); await loadBatch(candidate.batchId);
  }

  return <main className="portfolio-page">
    <header className="portfolio-hero"><div><p className="eyebrow">Research portfolio</p><h1>多主题研究项目台</h1><p>先比较候选主题，再将有潜力的方向立项为彼此隔离的开题与论文项目。</p></div><div className="portfolio-count"><strong>{projects.length}</strong><span>活动项目</span></div></header>
    <section className="portfolio-grid">
      <div className="panel portfolio-projects"><div className="panel-title"><FolderKanban size={19}/><div><h2>研究项目</h2><p>每个项目拥有独立证据、设计、稿件和结果</p></div></div>
        <div className="project-card-grid">{projects.map((project) => <a className="portfolio-project-card" key={project.id} href={`/?projectId=${encodeURIComponent(project.id)}`}><span>{project.field}</span><strong>{project.titleZh}</strong><p>{project.titleEn}</p><small>{project.status} · {project.version}</small><ArrowRight size={17}/></a>)}</div>
      </div>
      <form className="panel topic-intake" onSubmit={createBatch}><div className="panel-title"><Sparkles size={19}/><div><h2>新建候选主题批次</h2><p>默认比较 5 个方向，元数据不自动成为证据</p></div></div>
        <label><span>生成方式</span><select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="expand">从研究方向自动发散</option><option value="evaluate-only">评估我提供的多个题目</option></select></label>
        <label><span>研究领域或比较要求</span><textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="例如：生成式 AI 对消费者决策与平台治理的可检验研究方向"/></label>
        {mode === "evaluate-only" && <label><span>候选题目（每行一个，至少两个）</span><textarea value={seedTopics} onChange={(event) => setSeedTopics(event.target.value)} placeholder="题目一\n题目二"/></label>}
        <button className="button primary" disabled={submitting || !brief.trim()}><Plus size={15}/>{submitting ? "提交中" : "开始比较"}</button>
      </form>
    </section>
    <section className="portfolio-batches"><div className="section-header"><p className="eyebrow">Candidate comparison</p><h2>候选主题比较</h2></div>
      {batches.map((batch) => { const detail = details[batch.id]; return <article className="panel batch-card" key={batch.id}><header><div><strong>{batch.brief}</strong><span>{batch.inputMode === "expand" ? "自动发散" : "用户题目"} · {new Date(batch.createdAt).toLocaleString("zh-CN")}</span></div><span className={`status ${batch.status === "completed" ? "positive" : batch.status.includes("error") ? "warning" : "progress"}`}>{["queued","running"].includes(batch.status) && <LoaderCircle size={12} className="spin"/>}{batch.status}</span></header>
        <div className="candidate-table">{detail?.candidates.map((candidate) => <div className="candidate-row" key={candidate.id}><div className="candidate-main"><strong>{candidate.title}</strong><p>{candidate.description}</p>{candidate.report.confidence != null && <small>评估置信度：{String(candidate.report.confidence)} · 元数据仅用于发现</small>}{candidate.risks.length > 0 && <small>风险：{candidate.risks.join("；")}</small>}</div><div className="candidate-scores">{Object.entries(candidate.scores).map(([key,value]) => <span key={key}>{scoreLabels[key] ?? key}<b>{value}/5</b></span>)}</div><div className="candidate-action">{candidate.projectId ? <a className="button secondary" href={`/?projectId=${candidate.projectId}`}><Check size={14}/>已立项</a> : candidate.status === "evaluated" ? <button className="button primary" type="button" disabled={candidate.report.ethicsGate === "block"} onClick={() => void promote(candidate)}>{candidate.report.ethicsGate === "block" ? "伦理阻断" : "立项"}</button> : <span className="status neutral">{candidate.status}</span>}</div></div>)}</div>
      </article>; })}
      {batches.length === 0 && <div className="panel empty-draft">还没有候选批次。先从一个研究方向或多个已有题目开始。</div>}
    </section>
  </main>;
}

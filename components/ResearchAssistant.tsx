"use client";

import {
  Bot,
  Check,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PublicModelSettings } from "@/lib/types";

type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; activeJobId?: string | null };
type Message = { id: string; role: "user" | "assistant" | "system"; content: string; createdAt: string; jobId?: string | null; profileName?: string | null };
type Job = { id: string; conversationId: string; type: string; status: string; stage: string; progress: number; profileId?: string | null; profileName?: string | null; error?: string | null; createdAt: string; updatedAt: string; resultArtifactId?: string | null; hasFeasibilityReport?: boolean };
type ConversationPayload = { conversation?: Conversation; messages?: Message[]; jobs?: Job[]; error?: string };
type Candidate = { id: string; title: string; url?: string | null; source?: string | null; abstract?: string | null; metadata?: Record<string, unknown>; createdAt: string };
type Artifact = { id: string; type: string; title?: string | null; content: unknown; metadata?: Record<string, unknown>; createdAt: string };
type JobDetails = { artifacts: Artifact[]; candidates: Candidate[] };

function errorMessage(value: unknown, fallback: string) {
  return value && typeof value === "object" && "error" in value && typeof value.error === "string" ? value.error : fallback;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = { queued: "排队中", running: "执行中", paused: "已暂停", "waiting-user": "等待你的回复", "waiting-confirmation": "等待确认", completed: "已完成", failed: "执行失败", cancelled: "已取消" };
  return labels[status] ?? status;
}

function stageLabel(stage: string) {
  const labels: Record<string, string> = { "idea-intake": "解析研究想法", "keyword-planning": "生成检索关键词", "literature-search": "检索学术资料", "evidence-synthesis": "综合理论与证据", feasibility: "评估可行性", "proposal-outline": "生成开题结构", "proposal-draft": "生成英文章节", "consistency-review": "检查一致性" };
  return labels[stage] ?? (stage || "准备中");
}

function artifactLabel(type: string) {
  const labels: Record<string, string> = { "candidate-search": "检索记录", "feasibility-report": "可行性报告", "draft-version": "Proposal 章节草稿" };
  return labels[type] ?? type;
}

function artifactPreview(artifact: Artifact) {
  if (artifact.type === "candidate-search" && Array.isArray(artifact.content)) return `已保存 ${artifact.content.length} 组检索结果`;
  if (artifact.type === "draft-version" && artifact.content && typeof artifact.content === "object") return "已保存到稿件中心的新 DraftVersion";
  if (artifact.content && typeof artifact.content === "object") {
    const content = artifact.content as Record<string, unknown>;
    return [content.researchQuestion, content.theoreticalBasis, content.researchGap, content.designRecommendation, content.risks].filter(Boolean).map((value) => typeof value === "string" ? value : JSON.stringify(value, null, 2)).join("\n\n") || JSON.stringify(content, null, 2);
  }
  return String(artifact.content ?? "");
}

function jobErrorText(error?: string | null) {
  if (!error) return "";
  try {
    const parsed = JSON.parse(error) as { category?: string; message?: string };
    const labels: Record<string, string> = {
      missing_api_key: "所选模型没有可用的 API Key，请到模型设置检查密钥引用。",
      authentication: "模型认证失败，请检查 API Key。",
      permission: "当前 API Key 没有调用该模型的权限。",
      rate_limit: "模型服务触发限流，请稍后重试。",
      timeout: "模型调用超时，请重试或更换模型。",
      network: "无法连接模型服务，请检查网络和 Base URL。",
      provider_unavailable: "模型服务暂时不可用，请稍后重试。",
    };
    return (parsed.category && labels[parsed.category]) || parsed.message || "后台任务执行失败，请重试或更换模型。";
  } catch {
    return error;
  }
}

export function ResearchAssistant({ settings, notify, projectId }: { settings: PublicModelSettings; notify: (message: string) => void; projectId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [draft, setDraft] = useState("");
  const [profileId, setProfileId] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobDetails, setJobDetails] = useState<JobDetails>({ artifacts: [], candidates: [] });
  const eventSource = useRef<EventSource | null>(null);
  const messagesEnd = useRef<HTMLDivElement | null>(null);
  const composer = useRef<HTMLFormElement | null>(null);
  const enabledProfiles = useMemo(() => settings.profiles.filter((profile) => profile.enabled).sort((left, right) => left.priority - right.priority || left.name.localeCompare(right.name)), [settings.profiles]);
  const activeJob = jobs.find((job) => ["queued", "running", "paused", "waiting-user", "waiting-confirmation"].includes(job.status));
  const detailJob = jobs.find((job) => job.id === selectedJobId) ?? activeJob ?? jobs[0];
  const inputBlocked = Boolean(activeJob && ["queued", "running", "paused"].includes(activeJob.status));

  async function loadConversations(selectFirst = true) {
    const response = await fetch(`/api/assistant/conversations?projectId=${encodeURIComponent(projectId)}`);
    const result = await response.json() as { conversations?: Conversation[]; error?: string };
    if (!response.ok) throw new Error(errorMessage(result, "对话列表加载失败"));
    const next = result.conversations ?? [];
    setConversations(next);
    if (selectFirst && !conversationId && next[0]) setConversationId(next[0].id);
  }

  async function loadConversation(id: string) {
    if (!id) return;
    const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}`);
    const result = await response.json() as ConversationPayload;
    if (!response.ok) throw new Error(errorMessage(result, "对话加载失败"));
    setMessages(result.messages ?? []);
    setJobs(result.jobs ?? []);
  }

  async function loadJobDetails(id: string) {
    if (!id) return setJobDetails({ artifacts: [], candidates: [] });
    const response = await fetch(`/api/assistant/jobs/${encodeURIComponent(id)}`);
    const result = await response.json() as Partial<JobDetails> & { error?: string };
    if (!response.ok) throw new Error(errorMessage(result, "任务详情加载失败"));
    setJobDetails({ artifacts: result.artifacts ?? [], candidates: result.candidates ?? [] });
  }

  useEffect(() => {
    void loadConversations().catch((error) => notify(error instanceof Error ? error.message : "对话列表加载失败")).finally(() => setLoading(false));
    // The loader intentionally runs once when the assistant is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void loadConversation(conversationId).catch((error) => notify(error instanceof Error ? error.message : "对话加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!detailJob?.id) return setJobDetails({ artifacts: [], candidates: [] });
    setSelectedJobId(detailJob.id);
    void loadJobDetails(detailJob.id).catch((error) => notify(error instanceof Error ? error.message : "任务详情加载失败"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailJob?.id]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!activeJob || typeof EventSource === "undefined") return;
    eventSource.current?.close();
    const source = new EventSource(`/api/assistant/jobs/${encodeURIComponent(activeJob.id)}/events`);
    eventSource.current = source;
    const refresh = () => {
      void loadConversation(conversationId).catch(() => undefined);
      void loadJobDetails(activeJob.id).catch(() => undefined);
    };
    source.addEventListener("progress", refresh);
    source.addEventListener("message", refresh);
    source.addEventListener("completed", refresh);
    source.addEventListener("failed", refresh);
    source.onerror = () => source.close();
    const fallback = window.setInterval(refresh, 4000);
    return () => { source.close(); window.clearInterval(fallback); };
    // Only the active job id and selected conversation should drive this stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, conversationId]);

  async function createConversation() {
    const response = await fetch("/api/assistant/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "新的研究想法", projectId }) });
    const result = await response.json() as { conversation?: Conversation; error?: string };
    if (!response.ok || !result.conversation) return notify(errorMessage(result, "新建对话失败"));
    setConversations((current) => [result.conversation!, ...current]);
    setConversationId(result.conversation.id);
    setMessages([]);
    setJobs([]);
  }

  async function removeConversation() {
    if (!conversationId || !window.confirm("删除当前对话及其消息？已完成的研究稿件不会删除。")) return;
    const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    const result = await response.json() as { deleted?: boolean; error?: string };
    if (!response.ok) return notify(errorMessage(result, "删除对话失败"));
    const remaining = conversations.filter((conversation) => conversation.id !== conversationId);
    setConversations(remaining);
    setConversationId(remaining[0]?.id ?? "");
    setMessages([]);
    setJobs([]);
    notify("对话已删除");
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending || inputBlocked) return;
    let id = conversationId;
    if (!id) {
      const response = await fetch("/api/assistant/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: content.slice(0, 50), projectId }) });
      const result = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !result.conversation) return notify(errorMessage(result, "新建对话失败"));
      id = result.conversation.id;
      setConversationId(id);
      setConversations((current) => [result.conversation!, ...current]);
    }
    setSending(true);
    const response = await fetch(`/api/assistant/conversations/${encodeURIComponent(id)}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content, ...(profileId ? { profileId } : {}) }) });
    const result = await response.json() as ConversationPayload & { job?: Job; message?: Message };
    setSending(false);
    if (!response.ok) return notify(errorMessage(result, "消息发送失败"));
    setDraft("");
    await loadConversation(id);
    await loadConversations(false);
    notify(result.job ? "研究任务已提交，后台继续执行" : "消息已保存");
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    composer.current?.requestSubmit();
  }

  async function action(job: Job, actionName: "pause" | "resume" | "cancel" | "retry" | "confirm-proposal") {
    const response = await fetch(`/api/assistant/jobs/${encodeURIComponent(job.id)}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: actionName }) });
    const result = await response.json() as ConversationPayload & { job?: Job; error?: string };
    if (!response.ok) return notify(errorMessage(result, "任务操作失败"));
    await loadConversation(conversationId);
    await loadConversations(false);
    notify(actionName === "confirm-proposal" ? "已确认，Proposal生成任务已排队" : `任务${actionName === "pause" ? "已暂停" : actionName === "resume" ? "已继续" : actionName === "cancel" ? "已取消" : "已重试"}`);
  }

  if (loading) return <div className="page-content assistant-page"><div className="empty-draft">正在加载 AI 研究助手…</div></div>;

  return <div className="page-content doctoral-page assistant-page">
    <header className="section-header"><p className="eyebrow">Persistent research assistant</p><h1>AI研究助手</h1><p>用中文描述研究想法。助手会后台检索和评估；确认可行后，再生成英文 Confirmation Proposal 草稿。</p></header>
    <div className="assistant-layout">
      <aside className="assistant-conversations">
        <div className="assistant-list-heading"><strong>研究对话</strong><div>{conversationId && <button className="icon-button danger" type="button" onClick={() => void removeConversation()} aria-label="删除当前对话" title="删除当前对话"><Trash2 size={15} /></button>}<button className="icon-button" type="button" onClick={() => void createConversation()} aria-label="新建对话" title="新建对话"><Plus size={17} /></button></div></div>
        {conversations.map((conversation) => <button key={conversation.id} className={`assistant-conversation ${conversation.id === conversationId ? "active" : ""}`} type="button" onClick={() => setConversationId(conversation.id)}><strong>{conversation.title}</strong><span>{new Date(conversation.updatedAt).toLocaleString("zh-CN")}</span></button>)}
        {conversations.length === 0 && <div className="assistant-empty">还没有研究对话。直接在右侧输入第一个想法。</div>}
      </aside>
      <section className="assistant-chat">
        <div className="assistant-chat-header"><div><MessageCircle size={18} /><strong>{conversations.find((item) => item.id === conversationId)?.title ?? "新的研究想法"}</strong></div>{activeJob && <span className="status progress">{["queued", "running"].includes(activeJob.status) ? <LoaderCircle size={12} className="spin" /> : <Clock3 size={12} />}{statusLabel(activeJob.status)}</span>}</div>
        <div className="assistant-messages" aria-live="polite">
          {messages.length === 0 && <div className="assistant-welcome"><Bot size={25} /><strong>从当前项目的研究问题开始</strong><p>可以要求核查可行性、修订理论链、比较研究设计，或在证据门控下生成开题草稿。</p></div>}
          {messages.map((message) => <article className={`assistant-message ${message.role}`} key={message.id}><div className="assistant-message-icon">{message.role === "user" ? <UserRound size={15} /> : <Bot size={15} />}</div><div><div className="assistant-message-meta">{message.role === "user" ? "你" : "AI研究助手"}{message.profileName ? ` · ${message.profileName}` : ""}</div><p>{message.content}</p></div></article>)}
          <div ref={messagesEnd} />
        </div>
        <form ref={composer} className="assistant-composer" onSubmit={send}><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={submitOnEnter} placeholder="描述你的研究想法、疑问或需要修改的方向…" disabled={inputBlocked || sending} /><button className="button primary" type="submit" disabled={!draft.trim() || inputBlocked || sending}><Send size={15} />{sending ? "提交中" : "发送"}</button></form>
      </section>
      <aside className="assistant-job-panel">
        <div className="assistant-panel-heading"><Clock3 size={17} /><div><strong>后台任务</strong><span>关闭页面后仍会继续</span></div></div>
        <label className="assistant-model-select"><span>本次对话模型</span><select value={profileId} onChange={(event) => setProfileId(event.target.value)}><option value="">使用默认任务路由</option>{enabledProfiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name} · {profile.model}</option>)}</select></label>
        {activeJob ? <div className="assistant-job-card"><div className="assistant-job-status"><strong>{stageLabel(activeJob.stage)}</strong><span>{statusLabel(activeJob.status)}</span></div><div className="assistant-progress-track"><span style={{ width: `${Math.max(0, Math.min(100, activeJob.progress))}%` }} /></div><div className="assistant-progress-meta"><span>{activeJob.progress}%</span><span>{new Date(activeJob.updatedAt).toLocaleTimeString("zh-CN")}</span></div><div className="assistant-job-actions">{activeJob.status === "running" && <button className="button secondary" type="button" onClick={() => void action(activeJob, "pause")}><Pause size={14} />暂停</button>}{activeJob.status === "paused" && <button className="button secondary" type="button" onClick={() => void action(activeJob, "resume")}><Play size={14} />继续</button>}{["running", "queued", "paused", "waiting-user", "waiting-confirmation"].includes(activeJob.status) && <button className="icon-button danger" type="button" onClick={() => void action(activeJob, "cancel")} aria-label="取消任务" title="取消任务"><Square size={14} /></button>}{(activeJob.status === "waiting-confirmation" || (activeJob.status === "waiting-user" && activeJob.hasFeasibilityReport)) && <button className="button primary" type="button" onClick={() => void action(activeJob, "confirm-proposal")}><Check size={14} />{activeJob.status === "waiting-user" ? "按当前方案生成 Proposal" : "确认生成 Proposal"}</button>}</div></div> : <div className="assistant-empty"><CircleAlert size={16} /><span>当前没有运行中的任务。发送一个想法后，助手会自动在后台处理。</span></div>}
        {jobs.filter((job) => !activeJob || job.id !== activeJob.id).slice(0, 5).map((job) => <div className={`assistant-job-history ${detailJob?.id === job.id ? "active" : ""}`} key={job.id}><button type="button" onClick={() => setSelectedJobId(job.id)}><strong>{stageLabel(job.stage)}</strong><span>{statusLabel(job.status)}</span></button>{["failed", "cancelled"].includes(job.status) ? <button className="assistant-history-action" type="button" onClick={() => void action(job, "retry")} aria-label="重试任务" title="重试任务"><RefreshCw size={13} /></button> : <span />}</div>)}
        {detailJob && <div className="assistant-detail-panel">
          <div className="assistant-detail-heading"><strong>研究资料</strong><span>{jobDetails.candidates.length} 篇候选 · {jobDetails.artifacts.length} 项产物</span></div>
          {detailJob.error && <div className="assistant-job-error"><CircleAlert size={14} /><span>{jobErrorText(detailJob.error)}</span></div>}
          {jobDetails.artifacts.map((artifact) => <details key={artifact.id} className="assistant-artifact" open={artifact.type === "feasibility-report"}><summary><span>{artifact.title || artifactLabel(artifact.type)}</span><small>{artifactLabel(artifact.type)}</small></summary><pre>{artifactPreview(artifact).slice(0, 12000)}</pre></details>)}
          {jobDetails.candidates.length > 0 && <details className="assistant-candidates"><summary>候选文献（待人工核验）</summary><div>{jobDetails.candidates.slice(0, 30).map((candidate) => <article key={candidate.id}><strong>{candidate.url ? <a href={candidate.url} target="_blank" rel="noreferrer">{candidate.title}</a> : candidate.title}</strong><span>{candidate.source || "学术元数据"}{typeof candidate.metadata?.year === "number" ? ` · ${candidate.metadata.year}` : ""}</span>{candidate.abstract && <p>{candidate.abstract}</p>}</article>)}</div></details>}
        </div>}
      </aside>
    </div>
  </div>;
}

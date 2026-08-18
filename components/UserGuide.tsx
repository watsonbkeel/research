import {
  ArrowRight,
  Bot,
  BookOpen,
  Database,
  FileText,
  FileOutput,
  Network,
  Search,
  Settings,
  ShieldCheck,
  Table2,
  Wrench,
} from "lucide-react";

type GuideTarget = "assistant" | "literature" | "theory" | "design" | "writing" | "settings" | "manuscript" | "evidence-excerpts" | "research-plan" | "results" | "outputs" | "review" | "materials" | "figures";

const workflow = [
  {
    number: "01",
    title: "向AI描述研究想法",
    description: "用中文提出想法；后台自动检索、评估可行性并保存进度，关闭页面也不会停止。",
    target: "assistant" as const,
    action: "打开AI研究助手",
    icon: Bot,
  },
  {
    number: "02",
    title: "配置并测试模型",
    description: "先登记服务商、Base URL 和模型名，再选择环境变量或直接粘贴密钥。",
    target: "settings" as const,
    action: "打开模型设置",
    icon: Settings,
  },
  {
    number: "03",
    title: "建立文献证据库",
    description: "通过 OpenAlex 找候选文献；导入只代表候选，仍需逐步完成摘要、全文和论断核验。",
    target: "literature" as const,
    action: "打开文献证据",
    icon: Search,
  },
  {
    number: "04A",
    title: "核验书目与全文",
    description: "Candidate 只代表发现；完成 Crossref VerificationEvent 后才能升级 Work，再上传你有权使用的本地 PDF 并按页摘录证据。",
    target: "literature" as const,
    action: "查看候选与核验状态",
    icon: ShieldCheck,
  },
  {
    number: "04",
    title: "审查理论与研究设计",
    description: "确认当前项目的理论来源、构念定义、Study 设计和已经锁定的项目级边界。",
    target: "theory" as const,
    action: "打开理论模型",
    icon: Network,
  },
  {
    number: "05",
    title: "生成并审核英文草稿",
    description: "选择章节和临时模型；除方法章节外，必须先具备全文或论断级证据。",
    target: "writing" as const,
    action: "打开英文写作",
    icon: FileText,
  },
  {
    number: "06",
    title: "保存稿件与版本",
    description: "在稿件中心按章节保存英文 DraftVersion；刷新、重启或切换模型后仍可恢复历史版本。",
    target: "manuscript" as const,
    action: "打开稿件中心",
    icon: FileOutput,
  },
];

const troubleshooting = [
  ["密钥缺失", "直接密钥尚未保存，或密钥引用名在服务进程环境中不存在。"],
  ["认证失败", "密钥已加载，但供应商拒绝认证；检查密钥是否有效、是否有模型权限。"],
  ["端点不存在", "检查 Base URL 是否包含正确版本路径；连接测试需要兼容 /models。"],
  ["生成被证据门控阻止", "先在文献证据页完成全文阅读或定位到具体论断，再生成非方法章节。"],
  ["出现备用模型", "默认模型调用失败，系统已按优先级自动尝试后备模型。"],
  ["瞬时服务故障", "网络、限流、服务暂不可用或超时会由后台按递增间隔自动重试，最多 2 次；已保存的章节不会重新覆盖。"],
];

export function UserGuide({ onNavigate }: { onNavigate: (target: GuideTarget) => void }) {
  return (
    <div className="page-content guide-page">
      <header className="section-header">
        <p className="eyebrow">Workbench manual</p>
        <h1>使用指南</h1>
        <p>从模型配置、证据管理到英文开题导出的完整操作路径。研究设计使用中文管理，正式论文草稿使用英文生成。</p>
      </header>

      <section className="guide-start" aria-label="推荐工作流">
        {workflow.map((item) => {
          const Icon = item.icon;
          return (
            <article key={item.number}>
              <div className="guide-step-index"><span>{item.number}</span><Icon size={18} /></div>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
              <button type="button" onClick={() => onNavigate(item.target)}>{item.action}<ArrowRight size={15} /></button>
            </article>
          );
        })}
      </section>

      <section className="guide-band">
        <div className="guide-band-heading"><ShieldCheck size={19} /><div><p className="eyebrow">API key</p><h2>两种密钥配置方式</h2></div></div>
        <div className="guide-key-options">
          <div>
            <strong>直接粘贴 API Key</strong>
            <p>填写密码型“API Key”字段。系统保留完整大小写、连字符和其他符号，只写入权限为当前用户可读的本地密钥文件；保存后网页不会返回密钥内容。</p>
          </div>
          <div>
            <strong>环境变量引用</strong>
            <p>在“密钥引用名”填写例如 <code>MODEL_WRITER_KEY</code>，并在服务启动环境中提供同名变量。引用名只能使用大写字母、数字和下划线，不是密钥本身。</p>
          </div>
        </div>
        <button className="button secondary" type="button" onClick={() => onNavigate("settings")}><Settings size={16} />配置模型与路由</button>
      </section>

      <section className="guide-detail">
        <div className="guide-detail-heading"><Database size={19} /><div><p className="eyebrow">Evidence workflow</p><h2>证据等级与写作门槛</h2></div></div>
        <div className="evidence-ladder">
          {["unverified", "verified", "partial_match", "mismatch", "human_verified"].map((status, index) => (
            <div key={status}><span>{index + 1}</span><strong>{status}</strong></div>
          ))}
        </div>
        <p>OpenAlex、Crossref 和 Semantic Scholar 只产生 CandidateRecord。书目必须通过 VerificationEvent；全文解析和论断证据核验分别记录，只有研究者确认的 human_verified 摘录才能进入正式事实论断。PDF 只从本地上传，默认不会发送到外部模型。</p>
        <div className="guide-inline-actions">
          <button className="button secondary" type="button" onClick={() => onNavigate("literature")}><BookOpen size={16} />管理文献证据</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("design")}><Network size={16} />核对研究设计</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("evidence-excerpts")}><Database size={16} />登记证据摘录</button>
        </div>
      </section>

      <section className="guide-detail">
        <div className="guide-detail-heading"><Network size={19} /><div><p className="eyebrow">Traceability and integrity</p><h2>从假设到结果的追踪</h2></div></div>
        <p>在“假设与分析”中登记英文假设、中文理论推导、Study、构念、主估计量、模型公式和确认性/探索性状态。数据采集后先登记 Dataset、版本、checksum 和变量字典，再绑定真实且完成的 AnalysisRun；计划性研究不得写成已经完成。</p>
        <div className="guide-inline-actions">
          <button className="button secondary" type="button" onClick={() => onNavigate("research-plan")}><Network size={16} />打开研究矩阵</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("results")}><FileText size={16} />登记分析运行</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("outputs")}><FileOutput size={16} />运行输出检查</button>
        </div>
      </section>

      <section className="guide-detail">
        <div className="guide-detail-heading"><ShieldCheck size={19} /><div><p className="eyebrow">Audit and export gates</p><h2>正式稿与草稿的区别</h2></div></div>
        <p>章节生成先构建 SectionEvidenceBundle，再保存结构化 DraftVersion。CitationAudit 会检查 Work 核验、EvidenceExcerpt 定位、正文与参考文献一致性、撤稿和未支持论断；ConsistencyReview 会保存研究问题到分析模型的链条检查。自动审查通过不代表导师或人工批准。</p>
        <p>普通下载是草稿导出，会显示 blocker/warning 数量；带 <code>formal=1</code> 的 Markdown、DOCX、Proposal 或 ZIP 导出在有 blocker 时返回阻断，不会生成“正式版”。</p>
      </section>

      <section className="guide-detail">
        <div className="guide-detail-heading"><Search size={19} /><div><p className="eyebrow">P1 review and materials</p><h2>系统综述、材料和图表登记</h2></div></div>
        <p>论文级开题不能只保存文献列表。系统综述页记录数据库、检索式、日期、去重和 PRISMA 筛选计数；材料与量表页记录刺激版本、量表来源、题项权限和验证状态；图表与附录页集中检查表格、图形和附录是否已登记。候选元数据不会自动成为纳入证据。</p>
        <div className="guide-inline-actions">
          <button className="button secondary" type="button" onClick={() => onNavigate("review")}><Search size={16} />登记系统综述</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("materials")}><Wrench size={16} />登记材料与量表</button>
          <button className="button secondary" type="button" onClick={() => onNavigate("figures")}><Table2 size={16} />检查图表与附录</button>
        </div>
      </section>

      <section className="guide-troubleshooting">
        <div className="guide-detail-heading"><ShieldCheck size={19} /><div><p className="eyebrow">Troubleshooting</p><h2>常见提示</h2></div></div>
        <div className="guide-trouble-list">
          {troubleshooting.map(([title, description]) => <div key={title}><strong>{title}</strong><p>{description}</p></div>)}
        </div>
      </section>

      <section className="guide-export">
        <FileText size={19} />
        <div><strong>交付与导出</strong><p>顶部可随时导出 Markdown、BibTeX 和英文 DOCX。DOCX 是研究设计与证据包，不等同于已完成的系统综述、伦理审批或最终论文。</p></div>
      </section>
    </div>
  );
}

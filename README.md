# 开题证据台

本地单用户研究项目组合工作台，用于比较多个博士研究主题，并分别管理开题、证据、理论、实验设计、期刊论文和澳大利亚 Confirmation 准备状态。

## 多主题与多论文工作流

1. 根页面是“多主题研究项目台”。可以输入一个研究方向自动发散 3–8 个候选，或逐行提供多个题目统一评估。
2. 后台 worker 为每个候选检索学术元数据并比较研究意义、创新证据、理论一致性、可检验性、可行性和论文潜力；候选元数据不会自动成为正式证据。
3. 一个或多个候选可以分别立项。每个项目拥有隔离的证据摘录、研究计划、材料、数据、结果、助手对话、质量报告和导出。
4. 每个项目固定一份活动 Confirmation Proposal，并可建立多篇独立期刊论文。系统可依据 Study 与 Hypothesis 给出论文组合建议，研究者确认后才创建稿件。
5. 没有真实 AnalysisRun 的论文使用 `prospective` 模式。预期结果和条件式讨论可以起草，但禁止虚构样本、统计量和已完成研究结论；DOCX、Markdown 和项目 ZIP 都带有醒目标识。
6. 只有登记完成、真实且可复现的 AnalysisRun 后，论文才能切换到 `empirical` 模式并生成正式 Results/Discussion。

现有单项目数据库首次打开时会幂等迁移为一个活动项目，原有稿件、版本、证据、对话和任务不删除。模型配置与密钥保持全局共享，书目全局去重，摘录与核验状态按项目隔离。

## 运行

```bash
npm install
npm run dev
```

普通开发命令使用 Next.js 默认监听方式。若要只绑定本机 Tailscale IPv4，请使用：

```bash
npm run dev:tailscale
```

该命令读取 `tailscale ip -4`，默认使用端口 `3002`，也可通过 `TAILSCALE_BIND_IP` 和 `WORKBENCH_PORT` 显式指定。当前机器的访问地址为 `http://100.92.205.125:3002`。这不会停止或改变 `3000`、`3001` 等其他应用。

```bash
npm run typecheck
npm test
npm run build
```

## 数据与隐私

- 首次运行从 `data/seed.ts` 初始化，研究数据与设置保存在 `.local/workbench.sqlite`。
- 数据目录权限限制为当前用户；API 永远不会把模型密钥返回给浏览器。
- 默认禁止向模型发送文献全文。
- Markdown、BibTeX 和 DOCX 导出只从登记的数据对象生成，不包含模型密钥。

SQLite 使用 Node.js 22 内置的 `node:sqlite` 驱动，不需要安装原生数据库扩展。数据库启用 WAL，并通过键值状态表保存有版本的结构化工作区。

## 网页使用指南

打开工作台后，点击左侧“使用指南”或顶部问号按钮即可在网页内查看完整操作说明。指南覆盖模型与密钥配置、八类任务路由、文献证据等级、逐条证据摘录、稿件版本、研究矩阵、系统综述与 PRISMA、材料/量表权限、图表与附录、英文生成门槛、Results完整性门控、自动后备切换、常见错误及多种导出方式。

个人使用时优先打开左侧“AI研究助手”：用中文描述想法后，系统会把任务写入 SQLite，由 `article-worker` 后台检索 OpenAlex、Crossref 和 Semantic Scholar，并生成可行性报告。页面可以关闭；再次打开后会恢复对话和进度。可行性确认后，英文 Proposal 按章节保存为新的 DraftVersion，不会覆盖原稿或自动标记为已核验。

后台 worker 使用：

```bash
npm run worker:tmux
tmux attach -t article-worker
```

日志保存在 `.local/research-worker.log`。同一时间只执行一个主任务，其余任务排队。
worker 启动器会以与 Next.js 相同的方式加载 `.env.local`（若文件存在），因此网页调用和关闭页面后的后台调用使用同一组模型密钥；也可以继续只使用受限的 `.local/model-secrets.json`。
后台阶段遇到网络错误、限流、服务暂不可用或超时会自动按递增间隔重试，默认最多 2 次；认证、权限和请求格式错误不会盲目重试。Proposal 已保存的章节会通过 `completedSections` 跳过，不会因重试覆盖已有 DraftVersion。

## 博士论文级 P0 工作流

- “稿件中心”提供 Confirmation Proposal 的 17 章英文章节树、字数、研究状态、审阅状态和 DraftVersion 恢复。稿件内容写入 SQLite，不依赖浏览器临时状态。
- “证据摘录”将短引文或研究者释义绑定到文献、页码/段落和 Claim；受限全文不会发送到外部模型。
- “假设与分析”保存 Hypothesis、Estimand、模型公式、功效、排除、缺失和稳健性计划，并生成 Study Matrix。空链或断链显示为质量阻断。
- “系统综述”保存数据库、可复现检索式、SearchRun、去重和筛选计数；OpenAlex 发现记录不会自动成为纳入证据。
- “材料与量表”登记 Study 材料、刺激、模型/提示版本、卖家核验、量表题项、来源定位、授权和验证状态。
- “图表与附录”集中查看 Table、Figure 和 Appendix 登记状态；正式结果图表仍必须连接真实 AnalysisRun。
- “数据与结果”登记 Dataset、DatasetVersion、checksum、变量字典、可重复性检查和结构化 AnalysisRun。没有标记为真实数据且状态为 `completed` 的运行时，`Results` 英文生成会返回阻断，不会让模型编造统计结果。
- “输出与检查”区分 Evidence Pack 与完整 Confirmation Proposal。Proposal DOCX 包含标题页、版本/状态、AI声明、摘要、关键词、自动目录字段、图表目录、章节树、参考文献和附录；首次用 Word 打开后请更新目录字段。
- 目标院校未登记官方来源前，系统仅显示 generic Australian baseline，不声称符合任何具体大学。

## 多模型 API Key 与任务路由

设置页的“模型配置与任务路由”支持多个 OpenAI-compatible 端点。每条配置保存唯一 ID、名称、服务商、Base URL、模型名、优先级、启用状态、备注和 API Key 引用名。

1. 环境变量方式：将 `.env.example` 复制为本地环境配置，为 `MODEL_RESEARCH_KEY` 等引用名设置密钥，并在模型配置中填写相同引用名。
2. 直接密钥方式：在密码型“API Key”字段粘贴完整密钥。大小写、连字符和符号会原样保留，密钥写入权限 `0600` 的 `.local/model-secrets.json`，保存后字段清空且服务端不会回显。
3. 为八类任务选择默认模型和一个或多个后备模型。默认模型停用或调用失败时，服务端按优先级尝试后备模型；英文写作页还支持单次 `profileId` 覆盖。

支持的任务标识为：`literature_search`、`literature_summary`、`evidence_verification`、`chinese_research_design`、`english_academic_writing`、`citation_validation`、`translation`、`formatting`。

所有模型调用都在服务端执行。浏览器响应、日志、审计记录、Markdown、BibTeX 和 DOCX 不包含密钥值、完整提示词或密钥引用对应的秘密。SQLite 的 `model_settings` 只保存配置元数据；直接密钥单独保存在受限本地文件；`generation_audit` 只保存任务类型、配置名称、模型、耗时、响应状态和脱敏错误分类。

数据库迁移会在首次读取设置时自动执行：旧 `settings` 中的 Base URL、模型名称和全文开关会迁移到默认模型配置；旧的明文 `apiKey` 字段会被删除且不会复制到新结构。迁移后需通过 `LLM_API_KEY` 或新的 `MODEL_*_KEY` 环境变量重新提供密钥。研究工作区、文献、Confirmation 状态和已导入记录不受此次迁移影响。

连接测试目前使用 OpenAI-compatible `/models` 端点，可区分缺少环境变量、认证失败、权限不足、限流、超时、网络错误和服务不可用。某些只实现 `/chat/completions` 而没有 `/models` 的服务商需要通过实际生成任务验证，或提供兼容的模型列表接口。

## 主要工作流

- 在 Confirmation 矩阵中更新开题准备状态；
- 查看理论、构念、两个实验及其识别边界；
- 在本地文献库中筛选证据，或通过 OpenAlex 在线检索并导入候选记录；
- 区分 DOI、书目、摘要、全文和论断证据五个核验层级；
- 运行引用完整性检查；
- 导出 Markdown 研究包和 BibTeX 文献库；
- 导出英文 DOCX 研究包，用于导师审阅和后续正式英文写作；
- 在模型配置中心管理多个 OpenAI-compatible 模型、任务路由、备用切换和单次英文写作覆盖；默认不发送全文。

## 研究完整性规则

- “已发表事实”必须绑定证据库中的至少一个文献 ID。
- 引用库之外的 ID 会阻断校验。
- 只有 DOI 或书目信息核验的来源会产生全文证据警告。
- “研究者推论”和“待检验假设”必须显式标记。
- 联系卖家意向和购买意向是代理指标，不表述为真实成交。
- 创新性页面提供可审计证据，不保证绝对原创。

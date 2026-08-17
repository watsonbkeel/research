# 博士论文级输出优化需求

**用途：** 交由主对话进入开发模式实施  
**基准材料：** `docs/ Putting Words in Their Mouths Firm-Generated User Content and Consumer Sharing Behavior..pdf`  
**适用项目：** AI辅助二手商品文案与C2C买家反应博士研究  
**文档日期：** 2026-08-08  
**优先级定义：** P0 = 阻断博士开题级交付；P1 = 阻断论文级严谨度；P2 = 增强与规模化能力

---

## 1. 文档目的

本文件将参考论文体现出的学术严谨度，转化为当前博士开题助手的产品、数据、研究流程、英文写作和导出需求。

目标不是复制参考论文的选题、表述、实验数量或结论，而是使系统最终能够支持以下质量特征：

1. 研究问题、理论、假设、研究设计、数据、分析和结论形成完整可追溯链；
2. 每个外部事实和理论论断均能定位到经过核验的来源；
3. 每项研究均有透明的样本、程序、测量、排除规则、统计方法和稳健性检查；
4. 正式英文稿具有规范的目录、章节、图表、交叉引用、参考文献和附录；
5. 开题稿、预注册稿、研究报告、期刊论文和最终博士论文被明确区分；
6. 在尚未获得真实数据时，系统绝不生成虚构结果或把计划写成已经完成的研究。

## 2. 基准论文的可借鉴特征

### 2.1 基准定位

参考文件是一篇发表于 *Journal of Marketing* 的 23 页正式期刊论文，DOI 为 `10.1177/00222429251331483`。它不是博士论文，也不是澳大利亚大学的 Confirmation proposal。

因此，系统应借鉴其论证密度和研究透明度，但博士项目还必须补充期刊论文通常没有的前置内容，例如目标大学要求、详细研究计划、时间表、资源、伦理路径、数据管理计划和完整附录。

### 2.2 参考论文体现出的质量维度

| 质量维度 | 参考论文体现 | 对当前项目的启示 |
|---|---|---|
| 概念贡献 | 先定义新现象，再与相邻概念逐项区分 | 当前项目必须清楚区分 AI-assisted、AI-generated、seller-written、来源透明度、内容质量和卖家核验责任 |
| 理论链条 | 理论机制、竞争路径、调节条件和结果变量连续推导 | 不能只列出信息不对称、信号理论和 S-O-R；必须形成逐条可检验推导 |
| 假设体系 | 每个假设都对应理论逻辑和后续统计检验 | 当前系统缺少结构化 `Hypothesis` 对象及假设到分析模型的映射 |
| 研究项目矩阵 | 使用总览表连接研究、样本、设计、变量和发现 | 当前两个实验需要统一的 Study Matrix，并支持预试、主实验、复制或外部验证 |
| 多方法证据 | 结合实验、真实行为、不同情境和不同样本 | 当前研究至少应评估是否需要预试、行为性结果或外部效度研究，而不是机械增加实验数量 |
| 数据透明度 | 报告招募平台、最终样本、排除、随机化和数据质量检查 | 当前系统需保存样本流程、排除理由、随机化、缺失值和数据质量规则 |
| 测量透明度 | 量表来源、题项、操纵、预测试和信效度均可追踪 | 当前构念多处仍为“量表待核验”，无法支持正式论文写作 |
| 统计透明度 | 报告模型、系数、标准误、显著性、置信区间、效应量和稳健性分析 | 当前系统没有数据集、分析运行、结果表和图形的数据结构 |
| 可重复性 | 提供预注册、开放数据和补充材料入口 | 当前系统需管理 OSF/AsPredicted、分析代码、材料、数据版本和许可状态 |
| 讨论深度 | 分开讨论理论贡献、管理启示、消费者福利、边界和未来研究 | 当前导出只包含简短 Expected Contribution，深度不足 |
| 研究完整性 | 清楚区分探索性和验证性分析 | 系统必须在假设、分析和结果中标注 confirmatory/exploratory |

### 2.3 不能直接照搬的内容

1. 不能因为参考论文使用多个样本，就要求本项目固定使用相同数量的样本或研究。
2. 不能复用参考论文的理论、刺激材料、量表题项或文本表达，除非权限和引用条件允许。
3. 不能把期刊论文的结果章节套入尚未采集数据的开题稿。
4. 不能把联系卖家意向或购买意向描述成真实成交、销售额或实际转化率。
5. 不能因模型生成了完整英文段落，就把其状态标为“证据已核验”或“可提交”。

## 3. 当前系统基线与关键差距

### 3.1 当前已有能力

- 中文研究设计与英文写作分离；
- v0.4 两实验设计已经锁定；
- 12 条种子文献、5 级证据状态和基础 DOI/元数据管理；
- 3 条 Claim 及基础引用完整性检查；
- 理论、构念、实验、新颖性和 Confirmation 清单数据对象；
- 多模型路由、API Key 安全存储和生成审计；
- Markdown、BibTeX 和 DOCX 导出；
- 非方法章节的全文证据门控。

### 3.2 P0 阻断问题

1. **当前 DOCX 是 evidence pack，不是完整 proposal/manuscript。** 缺少摘要、关键词、完整背景、批判性综述、完整理论推导、正式假设、详细分析计划、时间表、预算、风险和附录。
2. **没有 Manuscript/Chapter/Section 数据模型。** 英文生成结果只存在浏览器临时状态，不能形成可版本化、可审阅、可恢复的长篇稿件。
3. **没有正式目录系统。** DOCX 缺少 Table of Contents、List of Tables、List of Figures、缩略语表、章节编号和交叉引用。
4. **没有逐条证据摘录。** `Work` 只保存书目信息和总体状态，无法证明某个来源的哪一页支持哪个论断。
5. **没有结构化假设与分析计划。** 当前类型中没有 `Hypothesis`、`Estimand`、`AnalysisModel` 或它们与构念、实验的关联。
6. **没有数据与结果层。** 系统无法保存数据字典、样本流程、统计结果、图表、模型版本或稳健性分析。
7. **导出内容与权威设计可能漂移。** 当前 `lib/docx-exporter.ts` 对 Experiment 2 的英文描述仍包含“seller-written versus AI-assisted”，与 v0.4 的“基础AI辅助标签 versus 卖家核验责任标签”不一致。
8. **长篇写作依赖单次模型调用。** 现有接口适合章节草稿，不足以维持整篇论文的术语、论证、引用和版本一致性。

### 3.3 P1 质量差距

- 文献库尚未形成可复现的系统检索、筛选、去重和 PRISMA 流程；
- 参考文献类型过于单一，BibTeX 将所有来源导出为 `@article`；
- 无作者数组、卷期页码、出版社、ISBN、URL、访问日期、数据库来源和全文权限字段；
- 无量表题项、来源页码、改写记录、授权状态和验证结果；
- 无刺激材料版本、事实表、生成来源、相等性检查和预试结果；
- 无研究级 preregistration、ethics、dataset、code 和 materials 注册表；
- 无可重复分析环境及结果再现检查；
- 无独立的学术语言、逻辑、引用、统计和格式审查门；
- 无目标大学/学院模板配置，不能保证字数、章节和格式符合具体 Confirmation 要求。

## 4. 产品必须区分的输出层级

系统必须增加 `DocumentType`，至少支持以下模式：

| 输出类型 | 允许内容 | 禁止内容 |
|---|---|---|
| Research Evidence Pack | 研究对象、证据状态、设计和缺口 | 冒充完整开题或论文 |
| Confirmation Proposal | 计划性研究背景、综述、理论、方法、可行性、伦理和时间表 | 在无数据时写结果或确定性结论 |
| Ethics/Preregistration Pack | 招募、程序、测量、排除、分析和数据治理 | 事后修改却不记录版本 |
| Study Report | 已完成研究的方法、真实结果和稳健性检查 | 使用模型编造统计值 |
| Journal Article | 面向目标期刊的压缩稿 | 隐藏与预注册不一致的分析 |
| Doctoral Thesis | 完整章节、综合讨论、参考文献和附录 | 用期刊论文长度替代博士论文论证深度 |

每种输出必须有独立模板、必填字段、状态门槛和语态规则。

## 5. 目标论文/开题架构

### 5.1 前置页

1. Title Page
2. Document status and version
3. Candidate, school, supervisors and institution
4. Declaration of originality/AI assistance（按院校要求）
5. Abstract
6. Keywords
7. Table of Contents
8. List of Tables
9. List of Figures
10. List of Abbreviations and Key Terms

### 5.2 Confirmation Proposal 主体

1. Introduction and Research Context
2. Problem Statement and Significance
3. Critical Literature Review
4. Research Gap and Auditable Novelty Position
5. Theoretical Framework and Conceptual Model
6. Research Questions and Hypotheses
7. Overall Research Programme
8. Study/Experiment 1 Methodology
9. Study/Experiment 2 Methodology
10. Optional Pre-study, Replication or External-validity Plan
11. Measurement and Instrument Validation
12. Sampling, Power and Analysis Plan
13. Ethics, Privacy, AI Use and Data Management
14. Feasibility, Resources, Risks and Contingencies
15. Timeline and Milestones
16. Expected Theoretical, Methodological and Practical Contributions
17. Limitations and Scope Boundaries
18. References
19. Appendices

### 5.3 最终博士论文扩展结构

在获得真实数据后，系统还应支持：

1. General Introduction
2. Systematic/Critical Literature Review
3. Integrated Theoretical Framework
4. Overarching Methodology
5. Study 1: Method, Results and Discussion
6. Study 2: Method, Results and Discussion
7. Optional Replication/Field Validation
8. General Discussion
9. Theoretical Contributions
10. Practical, Platform and Consumer-welfare Implications
11. Limitations and Future Research
12. General Conclusion
13. References
14. Appendices and Reproducibility Materials

## 6. 数据模型升级需求

### 6.1 稿件与章节模型（P0）

新增：

```text
Manuscript
DocumentTemplate
Chapter
Section
ContentBlock
DraftVersion
ReviewComment
RevisionDecision
GlossaryTerm
FigureRecord
TableRecord
AppendixRecord
```

最低字段要求：

- 稳定 ID；
- 文档类型、语言、目标大学/期刊；
- 章节层级、顺序、编号和标题；
- 目标字数、当前字数和完成状态；
- 正文、引用 ID、论断 ID 和依赖对象；
- 生成模型、生成时间、提示模板版本和人工编辑状态；
- 草稿版本、变更摘要、审阅人和审批状态；
- `planned / completed / verified` 研究状态；
- `draft / evidence-checked / methods-checked / supervisor-reviewed / approved` 稿件状态。

验收标准：刷新页面、重启服务或切换模型后，已保存章节和历史版本不得丢失。

### 6.2 文献与证据模型（P0）

扩展 `Work`：

- source type：journal article、book、chapter、conference paper、thesis、report、web page、dataset；
- authors structured array、year、title、container title、volume、issue、pages；
- DOI、ISBN、ISSN、URL、accessed date；
- publisher、database、OpenAlex/Crossref/Scopus/WoS identifiers；
- abstract、author keywords、index keywords；
- full-text local path、checksum、version、access rights；
- peer-review status、retraction/correction status；
- import source and imported-at timestamp；
- duplicate cluster and canonical record ID。

新增 `EvidenceExcerpt`：

- work ID；
- page、section、paragraph/table/figure locator；
- short quotation or researcher paraphrase；
- claim supported/challenged；
- support direction：supporting、contradicting、mixed、context-only；
- evidence strength and relevance；
- reviewer、review date、verification status；
- copyright/AI-use permission status。

新增 `ClaimEvidenceLink`，使每个外部事实能够从论文段落追踪到 Claim，再追踪到具体文献页码。

验收标准：没有 `EvidenceExcerpt` 的来源不得用于生成确定性的理论、结果或文献综述论断。

### 6.3 系统综述模型（P1）

新增：

```text
ReviewProtocol
DatabaseSource
SearchRun
SearchString
SearchResult
ScreeningDecision
ExclusionReason
DeduplicationRecord
CitationChase
PRISMAFlow
EvidenceSynthesisTheme
```

必须记录：

- 数据库、平台、检索式、字段、日期、过滤条件和结果数；
- 去重前后数量；
- title/abstract 与 full-text 两阶段筛选；
- 每条排除理由；
- 向前/向后引文追踪；
- 研究主题、理论、方法、样本、结果和局限的结构化提取；
- PRISMA 流程图所需计数；
- 检索更新日期和增量检索。

系统不得把 OpenAlex 候选结果自动视为系统综述纳入文献。

### 6.4 理论、构念和假设模型（P0）

新增 `Hypothesis`：

- hypothesis number and exact English wording；
- Chinese design explanation；
- type：main effect、mediation、moderation、interaction、moderated mediation、exploratory；
- theory IDs、construct IDs、study IDs；
- direction and boundary condition；
- supporting and competing evidence；
- confirmatory/exploratory status；
- primary/secondary status；
- falsification condition；
- current review status。

扩展 `Theory`：

- original source；
- bridge literature；
- core assumptions；
- unit and level of analysis；
- causal mechanism；
- boundary conditions；
- competing theory；
- what would count as misuse of the theory。

扩展 `Construct`：

- conceptual definition；
- operational definition；
- object of perception（seller/platform/listing/product）；
- reflective/formative；
- item source and permission；
- discriminant constructs；
- study-specific role；
- manipulation versus measured variable。

### 6.5 研究设计与材料模型（P0/P1）

新增：

```text
Study
StudyCondition
Stimulus
StimulusVersion
FactSheet
Manipulation
ManipulationCheck
Instrument
ScaleItem
Pretest
SamplingPlan
RandomisationPlan
ExclusionRule
MissingDataPlan
PowerAnalysis
EthicsRecord
PreregistrationRecord
```

每项研究必须生成标准 Study Card：

- objective；
- research question and hypotheses；
- context and unit of analysis；
- design and conditions；
- constants and randomisation；
- sample source and eligibility；
- smallest effect of interest；
- power method and assumptions；
- measures and item order；
- manipulation and attention checks；
- exclusions, attrition and missing data；
- primary estimand and statistical model；
- ethics and deception status；
- materials/data/code availability。

### 6.6 数据、分析与结果模型（P1）

新增：

```text
Dataset
DatasetVersion
VariableDictionary
AnalysisPlan
AnalysisRun
StatisticalModel
ResultEstimate
RobustnessCheck
DescriptiveTable
FigureData
ReproducibilityCheck
```

最低要求：

- 数据来源、收集时间、样本漏斗、最终 N；
- 变量名称、类型、编码、缺失值和构念映射；
- 数据文件 checksum 和版本；
- 分析脚本路径、运行环境和依赖版本；
- 假设、estimand、模型公式和输出一一对应；
- coefficient/effect、SE、CI、p value、effect size；
- reliability、CFA/validity、measurement invariance（适用时）；
- manipulation checks、main tests、mediation/moderation；
- preregistered 与 exploratory 结果分开；
- robustness and sensitivity analyses；
- 表格和图形只能由结构化结果生成，不能由模型手写数字。

验收标准：系统在没有真实 `AnalysisRun` 的情况下必须阻止生成 Results 章节。

## 7. 文献与数据来源要求

### 7.1 文献来源层级

系统应区分：

1. discovery metadata：OpenAlex/Crossref；
2. bibliographic verification：出版商、DOI、图书馆目录；
3. abstract evidence；
4. full-text evidence；
5. claim-level evidence；
6. synthesis-level evidence：多篇来源共同支持、存在冲突或证据不足。

正式稿中的市场规模、平台用户、消费者行为、理论关系和既有实证结果不得仅依赖 discovery metadata。

### 7.2 研究数据来源

系统必须允许为每项研究登记：

- Prolific、CloudResearch、大学样本池、平台合作方或其他招募来源；
- 自陈意向、点击、联系行为、选择、浏览时间或实际平台行为；
- 自采数据、合作方数据、平台数据和公开数据；
- 数据许可、参与者同意、平台条款和跨境存储限制；
- 数据保留、匿名化、撤回和销毁计划。

当前主结果仍是 seller-contact intention。若未来增加真实行为性结果，必须作为新的结果变量和研究设计登记，不能直接改写现有变量名称。

### 7.3 权利与 AI 使用控制

参考 PDF 的版权页包含对 AI/机器学习使用的限制。系统后续导入任何全文时必须增加：

- rights status；
- local-use permission；
- external-model-use permission；
- quotation limit；
- export permission。

若 `external-model-use permission = prohibited/unknown`：

- 不得把全文或长摘录发送到外部模型；
- 只允许保存研究者撰写的结构化笔记和必要的短定位信息；
- 导出不得包含受限制的全文内容。

## 8. 长篇英文学术写作引擎

### 8.1 从单次生成改为分层生成（P0）

生成流程必须改为：

```text
Project brief
  -> approved outline
  -> chapter brief
  -> section evidence bundle
  -> paragraph claims
  -> English draft
  -> citation validation
  -> consistency review
  -> human approval
```

每次生成的输入必须包含：

- 当前文档类型和目标模板；
- 章节目标和字数预算；
- 已批准研究问题、假设和术语表；
- 该章节允许使用的 Claim 和 EvidenceExcerpt；
- 相关设计、分析或结果对象；
- 前后章节摘要；
- 禁止性规则和未解决占位符。

### 8.2 全局一致性控制（P0）

新增自动检查：

- 标题、RQ、假设、构念和实验条件是否一致；
- Experiment 2 是否始终保持 v0.4 的标签定义；
- primary/secondary outcome 是否一致；
- 联系卖家意向是否被误写为 actual conversion；
- 样本量、条件数、量表名称和模型公式是否跨章节冲突；
- planned study 是否被写成 completed study；
- 引用年份、作者和 DOI 是否与文献库一致；
- 图表正文引用是否存在；
- 所有缩略语首次出现是否定义。

### 8.3 多阶段 AI 审查（P1）

对每章分别执行：

1. Evidence reviewer：检查每个事实是否有具体证据；
2. Theory reviewer：检查理论是否被正确使用；
3. Methods reviewer：检查设计、估计量和结论边界；
4. Statistical reviewer：仅基于结构化结果检查数字和解释；
5. Academic English reviewer：检查语体、清晰度和逻辑；
6. Citation reviewer：检查引用完整性与 APA 7；
7. Cross-chapter reviewer：检查全稿一致性。

任何 reviewer 不得静默改写权威研究设计。修改必须形成建议和可接受/拒绝的差异记录。

### 8.4 生成状态和人工责任（P0）

每个内容块显示：

- AI-generated / human-edited / evidence-checked / supervisor-approved；
- 使用模型和提示模板版本；
- 未核验引用数；
- 阻断问题；
- 最后编辑者和时间。

AI 生成不能自动提升为 supervisor-approved。

## 9. 索引、目录、图表和引用系统

### 9.1 DOCX/PDF 目录要求（P0）

正式 DOCX 必须包含：

- Word Heading 1–4 样式；
- 自动 Table of Contents 字段；
- 自动 List of Tables；
- 自动 List of Figures；
- 页码；
- 章节、表格、图形和附录编号；
- caption；
- 交叉引用或稳定书签；
- 参考文献悬挂缩进；
- 附录目录。

若 Word 库不能直接更新页码，导出时应插入可更新字段，并在网页明确提示用户首次打开 Word 后执行“Update entire table”。

### 9.2 引用系统（P0/P1）

- 使用 CSL 或等价结构化引擎生成 APA 7；
- 支持 article、book、chapter、report、thesis、conference、web、dataset；
- 正文引用与参考文献自动双向校验；
- 未在正文引用的文献和正文引用缺失条目分别提示；
- 支持同作者同年份 `2025a/2025b`；
- 支持机构作者、无 DOI、ISBN、URL 和访问日期；
- DOI 规范化且不得重复加标点；
- BibTeX 类型必须按 source type 输出，不得统一使用 `@article`。

### 9.3 图表要求（P1）

至少支持生成：

- Conceptual model；
- Study overview matrix；
- PRISMA flow；
- Timeline/Gantt chart；
- Sample flow；
- Descriptive statistics table；
- Reliability/validity table；
- Hypothesis test table；
- Interaction/mediation plot；
- Robustness summary；
- Claim-evidence matrix。

所有结果图表必须连接结构化数据；概念图必须连接 Theory/Construct/Hypothesis。

## 10. 用户界面优化需求

### 10.1 新增主导航（P0）

- 稿件中心
- 系统综述
- 证据摘录
- 假设与分析计划
- 研究材料与量表
- 数据与结果
- 图表与附录
- 输出与格式检查

### 10.2 稿件中心（P0）

需要：

- 左侧章节树；
- 中间编辑器；
- 右侧 Claim/Evidence/Review 面板；
- 拖动章节排序；
- 章节字数和完成度；
- 中英对照研究设计查看；
- 版本比较和恢复；
- 锁定已批准段落；
- 一键运行本章审查；
- 不允许卡片嵌套造成密集信息不可读。

### 10.3 研究矩阵（P0）

增加一张贯穿项目的矩阵：

| Study | RQ | Hypothesis | Construct | Manipulation/Measure | Sample | Primary estimand | Analysis | Evidence status |
|---|---|---|---|---|---|---|---|---|

任何断链都显示为阻断错误。

### 10.4 完成度仪表板（P1）

完成度不得仅按是否存在文本计算，应分别显示：

- literature coverage；
- claim-level evidence coverage；
- theory traceability；
- scale verification；
- design completeness；
- ethics readiness；
- analysis readiness；
- manuscript completion；
- citation integrity；
- target-university compliance。

## 11. 澳大利亚大学开题适配

新增 `InstitutionProfile` 和 `ConfirmationTemplate`：

- university、faculty、school、program；
- milestone name；
- required sections；
- word/page limit；
- oral presentation requirements；
- panel composition；
- ethics prerequisites；
- data management requirements；
- AI use/declaration requirements；
- formatting and submission rules；
- official URL、access date and verification status。

在用户未选择目标大学前，系统只能标记为 generic Australian baseline，不能声称符合某所大学全部要求。

## 12. 研究内容层面的优化建议

以下是研究决策，不应由开发代码自动锁定：

1. 保留 v0.4 两个核心实验，不恢复旧 3×2 欺骗设计。
2. 增加正式的刺激与量表预试阶段，但将其标记为 pre-study，不虚增核心实验数量。
3. 评估 seller-contact intention 是否可加入更接近行为的 consequential measure，例如点击“联系卖家”或选择进入沟通步骤；必须经过伦理与可行性审核。
4. 评估是否需要跨产品、跨平台或不同卖家类型的复制研究，以增强外部效度。
5. 增加替代理论和竞争机制，例如 diagnosticity、seller trust、algorithm aversion/appreciation，并预先规定比较方式。
6. 明确 perceived information authenticity 的对象是“商品信息”而不是泛化的品牌、人类或广告真实性。
7. 对卖家声誉操纵进行现实性、强度和混淆预试。
8. 为 AI-assisted 和 AI-generated 建立真实可复现的生产协议、模型版本、提示、事实表和卖家核验记录。
9. 功效分析必须围绕最小关注效应和主交互/间接效应，不得只使用通用 medium effect。
10. 预先区分 primary、secondary、exploratory outcomes，控制多重比较和选择性报告风险。

## 13. 验收标准

### 13.1 P0 最小可交付

1. 可以创建并持久化完整 Confirmation Proposal 章节树。
2. 可以保存每章英文草稿、版本、审阅状态和证据绑定。
3. 每个已发表事实可以追踪到文献和具体页码/定位。
4. 存在结构化 Hypothesis，并能映射到 Study、Construct 和 AnalysisPlan。
5. Results 在没有真实数据和 AnalysisRun 时被阻断。
6. Experiment 2 在所有页面、API、提示和导出中与 v0.4 完全一致。
7. DOCX 含标题页、摘要、关键词、自动目录、图表目录、章节编号、页码、参考文献和附录。
8. APA 7 引用支持多种来源类型，正文与参考文献双向一致。
9. 目标大学配置可以改变必填章节、字数和格式检查。
10. 所有现有密钥安全、模型路由、证据门控和导出测试继续通过。

### 13.2 P1 论文级严谨度

1. 系统综述检索和筛选流程可复现并能生成 PRISMA 数据。
2. 量表、刺激、预试、功效、排除和分析计划均结构化保存。
3. 真实数据可版本化导入，结果表与图可由分析输出生成。
4. 预注册分析和探索分析明确分开。
5. 可以运行 evidence/theory/methods/statistics/citation/cross-chapter 审查。
6. 论文中的数字全部能追踪到 AnalysisRun，不存在模型手写统计值。
7. 可以生成 Study overview、Claim-evidence matrix 和完整附录。

### 13.3 回归测试

- 数据库 schema 迁移保留现有 workspace、模型配置和密钥引用；
- 旧 evidence pack 仍可导出；
- 新 proposal 导出不含中文正文，除非模板明确要求 bilingual；
- API Key 不进入稿件、日志、数据集或任何导出；
- 无权发送外部模型的全文不会进入模型请求；
- 页面刷新和服务重启后稿件版本不丢失；
- 目录、图表、引用和附录编号在增删章节后保持一致；
- 3000/3001 等其他服务不受开发和部署影响。

## 14. 推荐开发阶段

### Phase 1：博士开题稿基础（P0）

- schema v3 与迁移；
- Manuscript/Chapter/Section/Version；
- Hypothesis/AnalysisPlan；
- EvidenceExcerpt/ClaimEvidenceLink；
- v0.4 全局一致性校验；
- 稿件中心；
- 完整 DOCX 结构和自动目录；
- 目标大学模板。

### Phase 2：系统综述与研究材料（P1）

- 检索协议、筛选、去重和 PRISMA；
- 量表、题项、刺激、预试和功效分析；
- citation graph 和 claim-evidence matrix；
- 权利与全文 AI 使用控制。

### Phase 3：数据、统计与论文结果（P1）

- dataset registry 和 data dictionary；
- analysis runs、result estimates、tables and figures；
- preregistration comparison；
- reproducibility checks；
- Results/Discussion 生成门控。

### Phase 4：最终论文与发表适配（P2）

- thesis/article 双模板；
- 期刊字数和格式适配；
- LaTeX/PDF 可选导出；
- 全稿多阶段审查；
- supervisor review workflow。

## 15. 建议的多 Agent 开发拆分

主对话进入开发模式后，可并行安排：

| Agent | 负责范围 | 主要交付 |
|---|---|---|
| Schema & Storage Agent | schema v3、迁移、稿件版本、研究对象 | types、schemas、storage、migration tests |
| Evidence & Review Agent | EvidenceExcerpt、系统综述、权利控制 | evidence APIs、PRISMA、claim traceability |
| Manuscript & Export Agent | 稿件中心、目录、引用、DOCX | chapter editor、APA 7、TOC/figures/appendices |
| Research & QA Agent | v0.4 一致性、假设/分析、验收测试 | validators、fixtures、end-to-end tests |

实施时应先由主 Agent 冻结共享类型和迁移方案，再允许各 Agent 修改并行模块，避免同时编辑 `lib/types.ts`、`lib/schemas.ts` 和 `components/Workbench.tsx` 产生冲突。

## 16. 主对话实施时的首要修复清单

1. 修复 DOCX Experiment 2 与 v0.4 不一致的问题。
2. 引入 Manuscript/Chapter/Section/DraftVersion 并持久化英文草稿。
3. 引入 Hypothesis 和 AnalysisPlan，建立研究矩阵。
4. 引入 EvidenceExcerpt 和 ClaimEvidenceLink，升级证据门控。
5. 将当前 DOCX 标记为 Evidence Pack，另建 Confirmation Proposal 导出器。
6. 为 Proposal DOCX 增加自动目录、图表目录、章节编号和附录。
7. 增加目标大学模板和通用澳洲基线的明确区分。
8. 增加长期任务和分章节生成，不再依赖单次 60 秒调用完成长篇写作。
9. 为全文导入增加版权与外部 AI 使用权限字段。
10. 完成 schema 迁移、回归测试和网页使用指南更新。

---

## 结论

当前项目已经具备研究设计和证据管理的正确基础，但与正式博士开题稿、期刊论文或最终博士论文之间仍存在明显层级差距。下一阶段不应只是让模型“写得更长”，而应优先补齐稿件结构、证据定位、假设与分析追踪、数据结果可重复性、目录索引和版本审查能力。

只有当这些结构化对象和门控建立后，系统生成的英文内容才可能在深度、数据来源透明度、索引目录、引用完整性和研究可信度方面逐步接近参考论文体现的学术水平。

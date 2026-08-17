# 澳洲博士开题助手方案

**首个研究方向：AI提升C2C二手市场销售转化**  
**文档版本：0.4（2026-08-08）**  
**状态：研究设计与软件已实现；文献、量表、目标大学要求和功效参数仍待独立核验**

> **v0.4权威设计稿：** [research/design/v0.4_research_design.md](research/design/v0.4_research_design.md)。该稿已取代本文早期的“3×2 AI辅助程度×披露/不披露”单一实验，改为两个不依赖欺骗的实验。本文保留早期方案作为变更背景，正式研究问题、假设和实验条件以 v0.4 设计稿为准。

> **v0.3 变更记录**：新增信号成本悖论作为核心理论必答问题（AI 内容是低成本易伪造信号，方向依边界条件而定）；将"不披露"条件明确标注为 deception 设计并补充 HREC/debriefing 应对；RQ3 标注各变量角色（操纵因子/属性/测得调节）；商品涉入定为控制变量；缺口描述（现 4.4）纳入柠檬市场与信号双刃剑；新增 4.3 理论原始来源表（Akerlof/Spence/Mehrabian & Russell，待核验）；补充信号理论与信息不对称检索关键词；锁定感知真实性构念定义；统一第 1 节与符合性矩阵的"新颖性"措辞；英文工作题目调整为信号理论视角，与核心中介层级一致。
>
> **v0.2 变更记录**：以信号理论/柠檬市场（Akerlof 1970）为主导理论、S-O-R 降为过程性框架，提出"信号双刃剑"核心论点；将中介收敛为核心中介感知真实性 + 竞争/序列中介，加入竞争模型对比；明确 3×2 因子设计、不披露条件的逻辑约束与操纵检验；新增 a priori 功效分析与测量量表来源登记表；将"创新性审查"重定位为"可审计新颖性证据（非原创性判定）"；具体化反幻觉引用机制（检索注入+DOI校验+库外拦截）；数据模型新增 `SearchQuery`/`Hypothesis`/`Revision`；加入 HREC 伦理审批前置节点。

## 1. 项目目标

构建一个本地单用户 Web 应用，帮助博士研究者完成从研究方向录入、文献检索、理论映射、可审计新颖性证据收集到英文开题文稿生成的全过程。

- 界面、研究设计和解释使用中文。
- 正式开题题目、研究问题、假设和章节正文使用英文。
- 默认按照澳大利亚研究型大学常见的 `Confirmation of Candidature` 要求设计。
- 默认学科为营销/消费者行为。
- 默认场景为澳大利亚线上 C2C 二手智能手机市场；其他品类只作为后续复制研究。
- 默认结果变量为购买意向和联系卖家意向，不将其直接表述为真实成交率。

## 2. 建议研究题目

> **AI-Assisted Product Descriptions and Seller-Contact Intentions in C2C Second-Hand Marketplaces: Product-Information Authenticity, Provenance Transparency, and Seller Reputation**

中文工作题目：

> **AI辅助二手商品文案如何影响C2C买家联系卖家意向：商品信息真实性、来源透明度与卖家声誉**

该题目仍需根据文献综述、导师意见和目标大学要求进一步收窄。不能在尚未完成系统检索前宣称全球范围内不存在相同研究。

## 3. 澳大利亚博士开题通用要求

澳大利亚高校的具体名称、字数、时间点和答辩形式存在差异。首版采用可迁移的严格模板，具体学校通过院校配置覆盖。

开题材料至少应能够回答：

1. 研究问题是什么，为什么重要？
2. 对相关领域已有文献的批判性理解是什么？
3. 研究使用什么理论，理论如何解释变量关系？
4. 研究问题、假设、数据和方法是否相互一致？
5. 预期的理论贡献、方法贡献和实践贡献是什么？
6. 样本、数据、资源、时间和研究者能力是否支持完成？
7. 是否处理伦理、隐私、数据安全、AI使用和风险？
8. 研究是否具有足够新颖性（以可审计证据支持，非原创性判定），并且能够在Confirmation口头答辩中自洽说明？

助手应生成以下符合性矩阵：

| 开题维度 | 所需证据 | 当前状态 |
|---|---|---|
| 背景与重要性 | 二手市场、平台和AI应用的学术及实践问题 | 待完善 |
| 批判性文献综述 | 主题分类、争议、方法差异和研究不足 | 初步完成 |
| 理论基础 | 原始理论来源、构念定义和逻辑关系 | 初步完成 |
| 研究问题/假设 | 与理论和变量一一对应 | 初步完成 |
| 方法 | 样本、程序、测量、分析和可行性 | 研究设计草案 |
| 新颖性（可审计证据，非原创性判定） | 直接重合、相邻研究和缺口证据 | 待完整检索 |
| 伦理与隐私 | 受试者、平台数据、AI披露和数据管理 | 待目标学校确认 |
| 时间与资源 | 阶段、里程碑（含伦理审批前置周期）、软件、样本和预算 | 研究设计草案 |

## 4. 已发表文献的初步地图

以下为通过 OpenAlex/Crossref 初步发现的代表性已发表研究。它们是检索起点，不是完整系统综述。正式使用前应核对全文、卷期、页码、作者顺序和引用格式。

### 4.1 C2C、二手市场和在线信任

| 文献 | DOI | 与本项目的关系 | 状态 |
|---|---|---|---|
| Fang, Y., Qureshi, I., Sun, H., McCole, P., Ramsey, E., & Lim, K. H. (2014). *Trust, Satisfaction, and Online Repurchase Intention: The Moderating Role of Perceived Effectiveness of E-Commerce Institutional Mechanisms*. MIS Quarterly. | [10.25300/MISQ/2014/38.2.04](https://doi.org/10.25300/MISQ/2014/38.2.04) | 在线信任、满意度和再购买意向 | 开放元数据已核对 |
| Perren, R., & Kozinets, R. V. (2018). *Lateral Exchange Markets: How Social Platforms Operate in a Networked Economy*. Journal of Marketing. | [10.1509/jm.14.0250](https://doi.org/10.1509/jm.14.0250) | 社交平台和横向交换市场 | 开放元数据已核对 |
| Erkan, I., & Evans, C. (2016). *Social media or shopping websites? The influence of eWOM on consumers’ online purchase intentions*. Journal of Marketing Communications. | [10.1080/13527266.2016.1184706](https://doi.org/10.1080/13527266.2016.1184706) | 电子口碑与线上购买意向 | 开放元数据已核对 |
| Arman, S. M., & Mark-Herbert, C. (2021). *Re-Commerce to Ensure Circular Economy from Consumer Perspective*. Sustainability. | [10.3390/su131810242](https://doi.org/10.3390/su131810242) | 二手消费与循环经济 | 开放元数据已核对 |
| Dachyar, M., & Banjarnahor, L. (2017). *Factors influencing purchase intention towards consumer-to-consumer e-commerce*. Intangible Capital, 13(5), 948. | [10.3926/ic.1119](https://doi.org/10.3926/ic.1119) | C2C购买意向因素 | DOI与书目信息已核对；待全文核验 |
| Jang, Y., & Kim, S. (2023). *The Factors Influencing Users’ Trust in and Loyalty to Consumer-to-Consumer Secondhand Marketplace Platform*. Behavioral Sciences, 13(3), 242. | [10.3390/bs13030242](https://doi.org/10.3390/bs13030242) | 二手C2C平台信任与忠诚 | DOI与书目信息已核对；待全文核验 |
| Tang, Z., Zhou, Z., & Warkentin, M. (2022). *A contextualized comprehensive action determination model for predicting consumer electronics recommerce platform usage*. Information & Management, 59(3), 103617. | [10.1016/j.im.2022.103617](https://doi.org/10.1016/j.im.2022.103617) | 消费电子recommerce与混合方法 | DOI与书目信息已核对；待全文核验 |

### 4.2 AI、消费者反应和销售过程

| 文献 | DOI | 与本项目的关系 | 状态 |
|---|---|---|---|
| Puntoni, S., Reczek, R. W., Giesler, M., & Botti, S. (2021). *Consumers and Artificial Intelligence: An Experiential Perspective*. Journal of Marketing. | [10.1177/0022242920953847](https://doi.org/10.1177/0022242920953847) | 消费者如何体验和理解AI | 开放元数据已核对 |
| Singh, J., Flaherty, K., Sohi, R. S., et al. (2019). *Sales profession and professionals in the age of digitization and artificial intelligence technologies: Concepts, priorities, and questions*. Journal of Personal Selling & Sales Management. | [10.1080/08853134.2018.1557525](https://doi.org/10.1080/08853134.2018.1557525) | AI对销售和销售人员的影响 | 开放元数据已核对 |
| Arango, L., Singaraju, S. P., & Niininen, O. (2023). *Consumer Responses to AI-Generated Charitable Giving Ads*. Journal of Advertising. | [10.1080/00913367.2023.2183285](https://doi.org/10.1080/00913367.2023.2183285) | AI生成营销内容的消费者反应 | 开放元数据已核对 |
| Kirk, C. P., & Givi, J. (2025). *The AI-authorship effect: Understanding authenticity, moral disgust, and consumer responses to AI-generated marketing communications*. Journal of Business Research, 186, 114984. | [10.1016/j.jbusres.2024.114984](https://doi.org/10.1016/j.jbusres.2024.114984) | AI作者身份、真实性与营销反应；高优先级邻近研究 | DOI与书目信息已核对；必须优先阅读全文 |
| Cillo, P., & Rubera, G. (2024). *Generative AI in innovation and marketing processes: A roadmap of research opportunities*. Journal of the Academy of Marketing Science. | [10.1007/s11747-024-01044-7](https://doi.org/10.1007/s11747-024-01044-7) | 生成式AI与营销研究议程 | 开放元数据已核对 |
| Wen, Y., & Laporte, S. (2025). *Experiential Narratives in Marketing: A Comparison of Generative AI and Human Content*. Journal of Public Policy & Marketing. | [10.1177/07439156241297973](https://doi.org/10.1177/07439156241297973) | AI内容与人类内容的体验比较 | 开放元数据已核对 |
| Hermann, E., & Puntoni, S. (2025). *Generative AI in Marketing and Principles for Ethical Design and Deployment*. Journal of Public Policy & Marketing, 44(3), 332–349. | [10.1177/07439156241309874](https://doi.org/10.1177/07439156241309874) | 生成式AI营销和伦理设计 | DOI与书目信息已核对；待全文核验 |
| Wessel, M., Adam, M., Benlian, A., Majchrzak, A., & Thies, F. (2025). *Generative AI and its Transformative Value for Digital Platforms*. Journal of Management Information Systems, 42(2), 346–369. | [10.1080/07421222.2025.2487315](https://doi.org/10.1080/07421222.2025.2487315) | AI与数字平台价值 | DOI与书目信息已核对；待全文核验 |

### 4.3 理论原始来源

核心理论必须追溯到原始出处（区别于上方的实证文献地图），以满足第 9 节"每个核心理论均有原始来源"的验收标准。以下条目须与实证文献同样完成 DOI/元数据核验：

| 理论 | 原始来源 | DOI/标识 | 在本研究中的角色 | 状态 |
|---|---|---|---|---|
| 信息不对称 / 柠檬市场 | Akerlof, G. A. (1970). *The Market for "Lemons": Quality Uncertainty and the Market Mechanism*. Quarterly Journal of Economics. | [10.2307/1879431](https://doi.org/10.2307/1879431) | 情境前提（质量不可观测） | DOI与书目信息已核对；待全文定位 |
| 信号理论 | Spence, M. (1973). *Job Market Signaling*. Quarterly Journal of Economics. | [10.2307/1882010](https://doi.org/10.2307/1882010) | 主导理论 | DOI与书目信息已核对；待全文定位 |
| S-O-R | Mehrabian, A., & Russell, J. A. (1974). *An Approach to Environmental Psychology*. MIT Press. | 图书，无 DOI，须核 ISBN/版次 | 过程性组织框架 | 待核验 |

> 电子商务信任的原始模型来源（例如 Mayer/McKnight 等）尚未在本表登记，待 5.2 从原始实证文献确定后补入。

### 4.4 初步研究缺口

初步检索未发现一篇已经充分解决以下完整组合的问题：

> 在二手C2C商品存在质量和真实性信息不对称（柠檬市场）的条件下，AI辅助商品信息作为一种**低成本、易伪造的信号**，如何影响买家的转化意向；这种影响是否**以感知真实性为核心机制**（信任、信息诊断性为竞争/序列中介）发生；以及 AI 披露、卖家声誉等边界条件如何决定该信号呈现**正向还是负向**（信号双刃剑）。

该判断必须通过正式系统综述、引文追踪、数据库交叉检索和全文核验后才能写入正式论文。

## 5. 理论框架

本研究的理论立足点是**二手 C2C 市场的信息不对称**，而非泛化的"刺激—反应"过程。区别于普通电商研究的独特性在于：二手商品是异质、非标准化、质量事前不可观察的，最接近 Akerlof 的"柠檬市场"情境。因此以信号理论为主导理论，S-O-R 仅作为组织变量关系的过程性框架。

### 5.1 核心理论（主导）

1. **信息不对称与柠檬市场**（Akerlof, 1970, *The Market for "Lemons"*）：
   - 二手商品质量存在事前不可观测性，买家面临逆向选择风险；
   - 这是本研究区别于普通电商/B2B 销售研究的核心情境前提；
   - 任何降低质量不确定性的机制（信号）都可能影响买家转化意向。

2. **信号理论**（Spence, 1973）——**核心理论**：
   - 商品信息、卖家声誉、AI披露是买家用以推断不可观测质量的信号；
   - **核心理论论点（信号双刃剑）**：AI辅助内容存在理论张力——它既可能作为**正向质量信号**（信息更完整、结构更专业、诊断性更强），又可能作为**负向信号**（真实性存疑、模板化、被解读为卖家在掩盖真实状况）。这一"同一刺激的信号方向取决于边界条件"的机制，是本研究的主要理论新意所在，也是区别于"换场景重测 S-O-R"的关键。

   **必答理论问题（信号成本悖论）**：Spence 信号理论的核心命题是"信号成本越高、越难被低质量方伪造，信号越可信"。而 AI 生成文案的边际成本趋近于零，任何卖家都能零成本产出专业措辞。据此，信号理论给出一个与直觉相反的推论——**AI 内容作为质量信号本质上是低成本、易伪造的，其可信度理应偏低**。这与"AI 让信息更专业所以正向"的表层直觉直接冲突。本研究必须在理论章节明确回答：
   - 在何种边界条件下，AI 内容的"专业性提升"效应压过"低成本信号"的可信度折扣？
   - AI 披露、卖家声誉是否通过**恢复信号成本/可信度**（例如声誉是难以伪造的高成本信号）来扭转这一折扣？
   - 因此本研究的可检验预测是**方向依边界条件而定**，而非笼统假设"AI 提升转化"。这一悖论是本研究理论贡献的核心，不得回避。
   - 信号的有效性依赖信号成本、可信度和买家的解读能力，对应后文的调节变量（AI披露、卖家声誉、AI素养）。

### 5.2 过程性框架

3. **S-O-R理论**（Mehrabian & Russell, 1974）——组织框架，非理论贡献来源：
   - Stimulus：AI辅助商品信息（辅助程度 × 披露）；
   - Organism：核心中介感知真实性，以及竞争性中介信任、信息诊断性；
   - Response：购买意向、联系卖家意向。

4. **电子商务信任理论**：
   - 用于解释平台机制、卖家信息、内容质量和AI披露对买家信任的影响；
   - 在本框架中信任被定位为竞争性中介，而非唯一核心机制；
   - 具体模型和测量量表需要从原始实证文献中进一步确定。

### 5.3 理论登记规则

每个构念必须保存：英文名称、中文定义、原始理论来源、量表来源、变量类型、假设方向、适用边界和证据等级。助手不允许只列出理论名称而不说明理论如何解释研究关系。理论必须区分**主导理论（承载理论贡献）**与**过程性/组织框架（仅用于结构化变量）**，避免以通用框架冒充理论创新。

## 6. 研究问题与方法草案

> **历史版本提示：** 本节保留 v0.3 的研究推演，包含已经被 v0.4 取代的单一实验和中介设定。正式研究问题、假设、实验条件和分析计划不得从本节直接复制，应以 [v0.4_research_design.md](research/design/v0.4_research_design.md) 为准。

### 6.1 Research Questions

- **RQ1:** How does AI-enabled listing assistance affect buyers’ purchase and seller-contact intentions in C2C second-hand marketplaces?
- **RQ2:** Does perceived authenticity serve as the primary mechanism (mediator) linking AI-assisted listing information to conversion intentions, and do trust and information diagnosticity operate as competing or serial mediators?
- **RQ3:** How do the following moderate the effect, consistent with the signal-cost and signal-credibility conditions of signaling theory: AI disclosure (manipulated design factor), seller reputation and product category (manipulated factors or controlled attributes—to be fixed at design stage), and buyers’ AI literacy (measured moderator)?

> 说明：RQ3 涉及的变量在角色上不同，须在方法中明确标注——**操纵因子**（AI披露）、**可操纵或固定的属性**（卖家声誉、商品品类，设计阶段确定是入组因子还是恒定控制）、**测得调节变量**（AI素养）。析因因子同时作为其他因子效应的调节变量在术语上成立，但读者需清楚哪些是操纵、哪些是测量。

### 6.2 中介变量的收敛决策

为避免构念高度相关导致的多重共线性和区分效度问题，本研究不采用三个并列中介，而是明确层级：

- **核心中介：感知真实性（perceived authenticity）**。理由：AI辅助内容这一刺激最直接触发的心理反应是"这条信息/这件商品是否真实可信"，与信号双刃剑论点直接对应。
  - **构念定义（须在正式文稿中锁定，避免歧义）**：本研究情境下"感知真实性"可能指向三个不同对象——(a) **商品信息真实性**（描述是否如实反映实物状况）、(b) **卖家真实性**（卖家是否为真实、诚信的个体而非套路化商家）、(c) **内容真实性**（这段文案是否为真人真实表达，而非 AI 批量生成的模板）。三者对应不同量表和不同机制路径。首版将核心中介**限定为 (a) 商品信息真实性**（最贴合柠檬市场的质量不确定性），(c) 内容真实性作为与 AI 来源直接相关的次级构念纳入探索，(b) 卖家真实性通过卖家声誉因子承载。该限定须经导师确认。
- **竞争性/序列中介：信任（trust）、信息诊断性（information diagnosticity）**。作为竞争模型检验，并检验"信息诊断性 → 感知真实性 → 信任 → 转化意向"的序列中介（serial mediation）假设，而非三者简单并列。
- 建立并预注册**竞争模型对比**（并列中介 vs 序列中介），用信息准则和区分效度（AVE、HTMT）判定。

### 6.3 混合方法递进

1. **系统性文献综述与文献计量映射**：按照 PRISMA 2020 保存检索、筛选和排除过程。
2. **买家与卖家访谈**：识别AI商品信息的信任、真实性和可接受性机制，并为实验材料提供情境依据。
3. **在线情境实验（核心研究）**：见 6.4。
4. **数据分析**：测量模型检验（CFA、信度、AVE、HTMT）、因子实验分析（ANOVA/回归）、中介/调节分析（PROCESS 或 SEM）、竞争模型对比和稳健性检验。
5. **后续扩展**：若获得平台合作，再使用点击、咨询和成交数据验证真实转化；否则不把代理变量写成真实成交率。

### 6.4 实验设计与操纵检验

**因子设计**：`AI辅助程度 × AI披露`。

- **AI辅助程度**（受试者间）：三水平——无AI（卖家自撰）/ AI辅助（AI优化卖家草稿）/ AI全自动（AI独立生成）。
- **AI披露**（受试者间）：二水平——披露 / 不披露。

**关键设计约束（逻辑一致性）**：在"不披露"条件下，AI辅助程度对买家不可见，买家无从据此推断。因此：

- "不披露"条件用于估计 AI 内容本身在买家**未察觉来源**时的客观效果（内容质量路径）；
- "披露"条件用于估计**来源归因**触发的信号解读效果（真实性/信任路径）；
- 若强行在"不披露"下操纵披露相关的解读变量，逻辑不成立，故分析时明确区分"内容效果"与"归因效果"两条路径，必要时对不披露 × 辅助程度单元采用不完全设计并在文中说明。

**伦理警示（不披露条件属 deception 设计）**：向被试展示未标注来源的 AI 生成内容，本质是"以隐瞒方式进行的欺骗"（deception by omission）。这不仅是"写进伦理申请"的流程问题，而是可能**影响该设计能否通过 HREC 审查**的实质风险。因此必须：

- 在伦理申请中将"不披露"条件明确申报为 deception 设计，并论证其科学必要性（无法用非欺骗方式回答"来源未察觉时的客观效果"）；
- 设计强制的 **debriefing（事后告知）** 流程：实验结束后告知被试部分内容由 AI 生成、说明隐瞒理由，并提供撤回数据的选项；
- 在知情同意书中预留"本研究部分信息在结束后才完整披露"的一般性说明；
- 若目标大学 HREC 不接受该 deception 设计，需准备退路方案（例如全部披露、仅比较内容质量而不操纵来源察觉）。

**操纵检验（manipulation check）**：

- 披露操纵：被试是否正确识别"该信息是否由AI生成/辅助"；
- 辅助程度操纵：在披露条件下对"AI参与程度"的感知；
- 未通过操纵检验的样本按预注册规则处理（保留主分析 + 敏感性分析）。

**控制变量**：商品品类、价格、图片、卖家声誉评分保持恒定或作为设计因子显式控制。

### 6.5 样本量与功效分析

- 采用 **a priori power analysis**（G*Power 或等效工具），在开题前完成并写入文稿。
- 假设：主效应/交互效应目标效应量 f ≈ 0.25（中等，依据待由文献或预实验校准，不得凭空设定）、α = .05、power = .80。
- 依 3（辅助程度）× 2（披露）= 6 单元估算总样本，并为中介分析所需的 bootstrap 稳定性预留冗余（通常每单元不少于数十人量级，具体数值以功效分析输出为准）。
- 记录功效分析的输入参数、工具版本和输出，纳入核验附录。
- 说明流失率与注意力检验（attention check）导致的超募比例。

### 6.6 测量变量与量表来源登记

所有测量变量在写入方法前必须登记量表来源（遵循 5.3 理论登记规则）。当前为占位，须由原始实证文献填充：

| 变量 | 类型 | 量表来源（待核验填充） | 状态 |
|---|---|---|---|
| 购买意向 Purchase intention | 结果 | 待登记 | 占位 |
| 联系卖家意向 Seller-contact intention | 结果 | 待登记 | 占位 |
| 感知真实性 Perceived authenticity | 核心中介 | 待登记 | 占位 |
| 信任 Trust | 竞争中介 | 待登记 | 占位 |
| 信息诊断性 Information diagnosticity | 竞争中介 | 待登记 | 占位 |
| 商品涉入 Product involvement | 控制 | 待登记 | 占位 |
| AI素养 AI literacy | 调节 | 待登记 | 占位 |
| 二手购物经验 Second-hand shopping experience | 控制 | 待登记 | 占位 |

### 6.7 伦理审批前置约束（对时间线的影响）

访谈与情境实验均涉及真人被试，在澳大利亚必须先通过所在大学 **HREC（Human Research Ethics Committee）** 审批方可招募数据。该审批通常需要数周至数月，且可能要求补充材料或修改设计。因此：

- 数据收集里程碑必须以"伦理审批通过"为前置节点，不得与审批并行安排在关键路径上；
- 时间线需显式列出：伦理申请准备 → 提交 → 审批周期（含可能的修改往返）→ 批准 → 招募 → 数据收集；
- 实验材料（AI生成内容、披露措辞、被试知情同意、数据管理计划）需在伦理申请阶段定稿，与 5.3 的量表登记和 7.4 的AI披露要求一致；
- 具体审批时长和格式以目标大学 HREC 政策为准，写入院校配置（`InstitutionProfile`）。

## 7. 开题助手产品设计

### 7.1 工作流

研究项目创建 → 院校要求配置 → 文献检索 → 文献矩阵 → 理论映射 → 可审计新颖性证据收集 → 研究设计 → 英文开题生成 → 证据审核 → 导出。

> 说明：工具执行的是**"可审计新颖性证据收集"（auditable novelty evidence）**，而非"原创性判定"。系统只呈现直接重合、相邻研究和缺口的可追溯证据，供研究者和导师判断，不对"是否全球原创"下结论。UI 与所有导出文档统一使用这一措辞，避免给用户虚假的原创性安全感（这关乎学术诚信）。

### 7.2 文献与证据

- 使用 OpenAlex、Crossref、Unpaywall 等接口；
- DOI优先，标题和作者辅助去重；
- 保存检索式、数据库、时间戳、全文状态和版本快照；
- 文献标签分为直接重合、相邻研究、理论来源、量表来源和方法来源；
- 每个关键论断绑定来源和证据记录。

### 7.3 数据对象

`Project`、`InstitutionProfile`、`Work`、`SearchQuery`、`SearchSnapshot`、`FullTextEvidence`、`Claim`、`Theory`、`Construct`、`ResearchQuestion`、`Hypothesis`、`MethodStage`、`OutputDocument`、`Revision`（ChangeLog）。

关键对象说明：

- `SearchQuery`：独立承载可复现检索，保存完整查询式、数据库、时间戳和结果计数，支撑第8节的检索复现要求；
- `Hypothesis`：独立于 `ResearchQuestion`，绑定 `Construct`、假设方向和证据等级，支撑第9节"拟验证假设"的清晰追踪；
- `Revision`（变更记录）：记录版本号、时间、变更内容和责任人，支撑第9节的版本追踪验收标准。

### 7.4 AI与隐私

采用可配置的 OpenAI 兼容接口：

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL`

项目和全文默认本地保存。未经用户明确允许，不向外部模型发送全文。

**反幻觉引用机制（关键风险控制）**：LLM 编造 DOI 和引用是此类工具最致命的风险，因此采用"检索式注入 + 事后校验 + 库外拦截"三道防线，而非依赖模型自觉：

1. **仅检索注入**：正文生成时，引用只能从已核验的 `Work` / `FullTextEvidence` 库中按需检索并注入上下文，模型不得自由生成引用条目；引用以内部 ID 关联，而非让模型直接吐出 DOI 字符串。
2. **事后 DOI 存在性校验**：生成结束后回查 Crossref/OpenAlex，校验每条引用的 DOI 真实存在且元数据（作者、年份、期刊）与库内记录一致。
3. **库外引用拦截**：任何未出现在已核验库中的引用一律标红拦截，不允许进入导出文档；缺少证据的论断触发警告并阻断"已核验"状态。
4. 每条关键论断与其来源 `Claim`/`FullTextEvidence` 强绑定，导出时可生成引用溯源清单。

### 7.5 导出

首版支持英文 DOCX、中文/英文 Markdown、APA 7参考文献、BibTeX、可审计新颖性证据报告（auditable novelty evidence report，非原创性判定）和Confirmation符合性矩阵。

## 8. 核验附录

### 8.1 检索记录

初步使用的来源：OpenAlex、Crossref。后续应增加 Unpaywall、Google Scholar 或学校图书馆数据库，并保存每次检索的完整查询式和日期。

初步关键词组：

- `C2C`, `consumer-to-consumer`, `recommerce`, `second-hand marketplace`；
- `AI-assisted listing`, `AI-generated product description`, `generative AI marketing`；
- `purchase intention`, `seller contact intention`, `conversion`, `trust`, `authenticity`, `information diagnosticity`；
- `signaling theory`, `signal cost`, `signal credibility`, `information asymmetry`, `market for lemons`, `quality uncertainty`, `adverse selection`；
- `AI disclosure`, `algorithm disclosure`, `deception`（用于伦理与操纵相关检索）。

### 8.2 逐条核验问题

1. 每篇论文是否真实发表？
2. DOI、作者、年份、期刊、卷期和页码是否一致？
3. 是否能够获得合法全文？
4. 论文究竟研究了购买意向、联系行为还是实际成交？
5. 论文是否真正涉及二手C2C平台，而非普通电商或B2B销售？
6. 论文是否真正使用AI生成或AI辅助内容？
7. 理论是否来自原始论文或经典书籍？
8. 研究缺口是否由文献证据支持，而非由关键词搜索不足造成？
9. 实验材料、样本、伦理和分析方法是否符合博士研究可行性？
10. 澳洲目标大学是否有额外的Confirmation格式、字数或答辩要求？

### 8.3 重要限制

- 当前文献清单不是完整系统综述；
- 当前没有目标大学，因此澳洲要求只是通用基线；
- 当前没有平台合作，因此真实成交率无法在首版研究中承诺；
- AI辅助并不自动意味着转化提升，可能产生真实性、信任和伦理风险；
- 系统提供可审计的新颖性证据，但不做原创性判定，也不能保证全球范围内绝对原创；
- 真人被试研究受 HREC 伦理审批前置约束，数据收集时间线依赖审批进度，存在不确定性；
- 样本量依赖 a priori 功效分析，目标效应量需由文献或预实验校准，当前为占位假设。

## 9. 验收标准

- 其他AI可以单独读取文档并理解研究背景和限制；
- 所有种子文献带有 DOI 和核验状态；
- 每个核心理论均有原始来源；
- 已发表事实、研究者推论和拟验证假设清晰分开；
- 文档明确区分购买意向、联系卖家意向和真实成交；
- 文档包含可复现的检索和逐条核验清单；
- 后续修改能够通过版本号和变更记录追踪。

## 10. v0.4研究设计与软件实现状态

### 10.1 已锁定的研究设计

正式研究设计已经拆分为两个实验，详见 [v0.4_research_design.md](research/design/v0.4_research_design.md) 和结构化种子文件 [research_design_seed.json](research/design/research_design_seed.json)：

- **Experiment 1：** 卖家撰写、AI辅助和AI生成三种真实标注的商品文案生产方式；主要结果为联系卖家意向，商品信息真实性为核心中介。
- **Experiment 2：** 在相同AI辅助内容下，操纵可问责来源透明度和卖家声誉；不采用未披露AI来源的欺骗条件。
- 商品品类暂定为二手智能手机，刺激数量暂定为12个；刺激预试、量表核验和Monte Carlo功效分析是数据收集前置门槛。
- 主要估计量采用意向治疗效应（ITT）；意向指标不等于真实点击、咨询或成交。

### 10.2 已实现的软件

本地单用户工作台位于当前项目根目录，使用 Next.js、React、TypeScript、Node 22 内置 `node:sqlite` 和 `lucide-react`：

- Confirmation准备矩阵及本地状态更新；
- 文献证据库、分组筛选、OpenAlex在线检索和候选文献导入；
- 理论、构念、两个实验和新颖性证据视图；
- DOI/书目/摘要/全文/论断证据状态区分；
- 已发表事实、研究者推论和待检验假设的引用完整性校验；
- OpenAI兼容模型设置与连接测试；
- 证据门控的英文章节生成接口；方法章节可基于设计生成，其他章节需要全文或论断级证据；
- Markdown、BibTeX导出，并保留兼容导出路由。

数据库默认位于 `.local/workbench.sqlite`，模型密钥只保存在本地，默认不向外部模型发送全文。

### 10.3 当前核验缺口

- 目标大学尚未指定，Confirmation和伦理要求仍是通用基线；
- 商品信息真实性、联系卖家意向、AI素养和信息诊断性的量表题项仍待原始文献和权限核验；
- 在线市场信号、cheap talk、声誉和来源可信度的桥接文献仍需扩展；
- 两个实验的最终样本量依赖预试和Monte Carlo模拟；
- 当前文献库仍是种子库，不是完整系统综述。

正式核验产物：

- [澳大利亚博士开题与伦理要求核验](research/evidence/official_requirements.md)
- [初步文献证据地图](research/evidence/literature_evidence_map.md)

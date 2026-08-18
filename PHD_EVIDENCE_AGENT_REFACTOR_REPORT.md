# 博士开题证据闭环与 AI 研究助手重构报告

## 1. 原有问题

- OpenAlex、Crossref 和 Semantic Scholar 的发现结果曾与正式 Work/引用混用。
- DOI 非空可能被误解为 DOI 已核对；旧中文状态没有可验证事件约束。
- 生成 Prompt 只有摘录 ID 或自由文本，模型可以补写作者、年份、DOI、样本量和结果。
- 一致性审查曾只更新进度，不保存真正的审查结果。
- 助手消息主要按 `idea-assessment` 处理，不能读取当前项目、文档和章节。
- 导出器存在全局 workspace、正文引用与参考文献不一致、跨项目污染和硬编码示例的风险。

## 2. 最终架构

主链路现在是：

```text
ResearchQuestion -> CandidateRecord -> VerificationEvent -> Work
-> FullTextAsset -> EvidenceExcerpt -> ClaimEvidenceLink
-> SectionEvidenceBundle -> StructuredSectionDraft
-> CitationAudit -> ConsistencyReview -> HumanApproval -> Export
```

统一服务边界为 `GenerationService`、`EvidenceService`（证据存储/全文服务）、`CitationService`、`CitationAudit`、`ConsistencyReview` 和项目导出器。项目 API、`/api/generate`、`/api/manuscript/generate` 和有项目上下文的 worker Proposal 都走结构化生成服务。

## 3. 新增数据模型

- `BibliographicVerificationStatus`: `unverified`、`verified`、`partial_match`、`mismatch`、`failed`。
- `FullTextAsset` 与 `full_text_pages`：checksum、页数、权限、逐页文本和解析状态。
- `EvidenceExcerptRecord`：quote/paraphrase、page/locator、support direction、强度、权限和人工核验者。
- `ClaimEvidenceLink`、`SectionEvidenceBundle`、`StructuredSectionDraft`。
- `VerificationEvent`：来源、输入标识、时间、字段比对、结果、撤稿状态和响应 hash。
- `CitationAuditReport`、`ConsistencyReviewReport`、`revision_proposals`。

`bibliographicStatus`、`fullTextStatus` 和 `verificationStatus` 相互独立。`human_verified` 必须有 `reviewer` 和规范字段 `reviewedAt`；旧客户端的 `reviewDate` 仅作为兼容别名；AI 只能生成 `ai_suggested`。

## 4. 数据迁移

`lib/evidence-store.ts` 增加幂等迁移 `evidence-closure-v2`。首次执行会创建 `${db}.pre-evidence-closure-v2.bak`，并创建候选、核验、全文、审查和修订表。没有真实 `VerificationEvent(result=verified)` 的旧 Work（包括“DOI已核对”）都会降为 `unverified` 并设置重新核验标记；旧 `claim_verified` 在缺少人工信息时不会升级为 `human_verified`。重复启动不会重复迁移。

重新核验旧 DOI 时会复用并更新现有 Work ID，不会因唯一 DOI 约束而失败或产生重复记录。

## 5. 主要修改文件

- 数据与服务：`lib/types.ts`、`lib/evidence-store.ts`、`lib/storage.ts`、`lib/portfolio.ts`、`lib/bibliographic-verification.ts`、`lib/full-text.ts`、`lib/evidence-excerpts.ts`。
- 生成与审查：`lib/evidence-bundle.ts`、`lib/structured-draft.ts`、`lib/generation-service.ts`、`lib/citation-service.ts`、`lib/citation-audit.ts`、`lib/consistency-review.ts`、`scripts/research-worker.ts`。
- 助手：`lib/assistant-intent.ts`、`lib/assistant-tools.ts`、助手消息/任务 action API、候选与全文 API。
- 导出：`lib/project-document-exporter.ts`、`lib/proposal-exporter.ts`、`lib/exporters.ts` 及项目文档/Proposal/ZIP/兼容导出路由。
- 页面：`components/Workbench.tsx`、`components/DoctoralWorkbench.tsx`、`components/UserGuide.tsx`。
- 测试与文档：`tests/evidence-closure.test.ts`、`tests/full-text.test.ts`、`README.md`。

## 6. CitationService

`lib/citation-service.ts` 使用 Citation.js + CSL 插件，提供 CSL-JSON 转换、正文 token 渲染、参考文献渲染和 `referencesFor`。当前 APA 7 已接入，Harvard/GB7714 保留样式接口。支持期刊、图书、章节、会议、报告、学位论文、网页和数据集类型；正文和参考文献共享同一 Work 集合。同作者同年份在正文和参考文献中生成 `a/b` 后缀。未知 token、未核验 Work 和撤稿 Work 不得通过正式审查。

## 7. CitationAudit 规则

审查会持久化检查：引用 token 是否解析、Work 是否属于当前项目且已书目核验、EvidenceExcerpt 是否存在/有定位/属于当前项目、formal 模式是否 `human_verified`、support direction 是否冲突、撤稿/更正文献、Claim 是否有证据、正文引用与 `citationIds` 是否双向一致、未支持论断以及跨项目污染。撤稿为 blocker，更正文献为 warning。正式导出有 blocker 时返回 HTTP 409；草稿导出保留 blocker/warning 数量和醒目标识。

## 8. ConsistencyReview

`runConsistencyReview` 先保存 `running` 状态，再保存最终 `passed`、`passed_with_warnings` 或 `blocked` 报告；人工批准单独为 `not_reviewed`、`approved`、`changes_requested`，可通过文档审查 API 更新。确定性检查覆盖 Study、Hypothesis、Construct、estimand/model、power 依据、结果语气和构念来源，自动通过不等于人工批准。

## 9. AI 助手意图和工具

支持 `qa`、`idea_assessment`、`topic_comparison`、`literature_search`、`bibliographic_verification`、`full_text_search`、`evidence_extraction`、`unsupported_claims`、`citation_audit`、`consistency_review`、`section_draft`、`section_revision`、`proposal_generation`、`export` 和 `job_control`。计划经过 Zod 校验并绑定 project/document/section。

只读请求在长任务运行时仍可执行。章节修订会调用当前证据包生成持久化 diff，只有 `apply-revision` 且任务绑定同一项目时才创建新 DraftVersion；重复应用同一 diff 会被拒绝。助手可读取项目快照、当前文档、质量阻断、未支持论断、已引用 Work 和 Claim 证据。

## 10. PDF 与全文处理

`POST /api/projects/:projectId/full-text` 接收用户上传 PDF，保存到 `.local/projects/<projectId>/full-text`，计算 SHA-256，使用 `pdfjs-dist` 按页解析并写入 `full_text_pages`。`GET` 支持项目内全文搜索。上传不会抓取付费墙全文，API 不返回服务器 `localPath`。EvidenceExcerpt 关联 FullTextAsset 时，直接 quote 必须在本地解析文本中连续出现。

## 11. 权限与版权边界

上传来源、rights status 和 external model permission 分开保存。全文默认 `prohibited`；生成 Prompt 只有在全局设置允许全文且该摘录明确为 `allowed` 时才包含 quote/paraphrase，否则只提供书目信息、定位和“文本已隐藏”。受限全文可以本地搜索和人工摘录，不会自动外发。导出不包含全文、密钥、完整系统 Prompt 或内部密钥引用。

## 12. 测试

新增/补充覆盖：Crossref verified、标题 mismatch、旧 Work 重新核验、Candidate 不可直接正式引用、EvidenceExcerpt 跨项目隔离、human_verified reviewer/date 约束、证据包外 citation token、同作者同年份后缀、正文 token 不泄漏、PDF 按页解析和本地搜索、助手意图路由、长任务只读请求、正式审查持久化、Prospective 结果门控和 worker 重试。

## 13. 四条命令实际结果

在当前工作区最终依次执行：

```text
npm run lint       PASS (exit 0, no warnings)
npm run typecheck  PASS (exit 0)
npm test           PASS (17 files, 66 tests)
npm run build      PASS (Next.js 15.5.23, 35 static pages/routes generated)
```

PDF 测试 stderr 有 pdfjs 的 `standardFontDataUrl` 提示，但解析、页数和全文搜索断言均通过；这不是测试失败。

## 14. 已知限制

- Crossref 响应无法确认撤稿时保留 `retractionStatus=unknown`；目前没有 Publisher/Retraction Watch 适配器。
- 一致性审查当前以确定性规则为主，模型辅助 JSON 复核接口尚未默认启用。
- 没有项目 ID 的历史 Proposal worker job 保留兼容性自由文本回退路径；该路径不具备正式证据升级能力，新的项目任务全部走结构化服务。
- OpenAlex/Crossref/Semantic Scholar 仍是 metadata-discovery；无 DOI 候选需要人工选择和核验。
- PDF 文本提取对扫描件/OCR 依赖外部 OCR，解析失败会保存 `parse_failed`，不会假装已阅读。

## 15. 后续非阻断优化

- 增加 Crossref/Publisher 更正与撤稿状态缓存和人工复核界面。
- 为扫描 PDF 增加本地 OCR，并允许研究者在页级 diff 中确认文本。
- 为 ConsistencyReview 增加可选、脱敏且可关闭的模型辅助 JSON 检查。
- 为 Candidate 列表增加批量人工选择、无 DOI 题名/作者/年份匹配和审查历史筛选。
- 为学校自定义 CSL 样式增加配置 UI，并扩展导出快照测试。
- 将旧的兼容导出 URL 逐步从 UI 入口移除；当前它们已要求显式 `projectId`、`documentId`，并复用项目级审查。

## 16. 手工验收步骤

1. 启动 `npm run dev`，打开“文献证据”，搜索并导入一条 DOI 候选；确认页面写的是“仅发现，未核验”。
2. 点击“核验书目”，确认生成 VerificationEvent；只有匹配成功才出现 `Work: 书目已核验`。
3. 在“证据摘录”上传当前项目 PDF，确认显示页数和 `外部模型：prohibited`；用本地搜索找到页码并保存摘录。
4. 先尝试保存缺少 reviewer/date 的 `human_verified`，应被拒绝；补齐后状态才可保存。
5. 在稿件中心运行“引用审查”和“一致性审查”，检查报告状态、blocker/warning 和“自动审查不等于人工批准”提示。
6. 输入“第三章没有参考文献，帮我检查并补充”，确认助手意图为 citation audit/section revision，而不是 idea assessment；修改前能看到 diff，应用后产生新 DraftVersion。
7. 下载普通 Markdown/DOCX/ZIP，确认有草稿审查标识；使用 `?formal=1` 在存在 blocker 时应返回 409，且正文没有 `[[CITE:...]]`。
8. 创建第二个项目，分别上传/导出，确认候选、全文、EvidenceExcerpt、Work 和参考文献不跨项目出现。

## 环境与 Git 说明

本次未执行远程 push，也未删除或覆盖 `.local/workbench.sqlite`。执行 `git status --short --branch` 时当前 `/root/article/.git` 挂载不是可识别的 Git 工作树，命令返回 `fatal: not a git repository`；因此无法在此环境提供 Git diff 或提交记录，代码文件和测试结果仍已实际写入并验证。

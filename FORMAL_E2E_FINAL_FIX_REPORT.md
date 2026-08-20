# Formal E2E Final Fix Report

## 1. Git 基线与提交

- 开始分支：`codex/p0-final-closure-3`
- 开始提交：`f0c0a4320f41076e83aa4bf89e8810721d1630a0`
- 工作分支：`codex/formal-e2e-final-fix`
- 测试先行提交：`dda2ade` (`test: reproduce remaining formal workflow regressions`)
- 生产修复提交：`819aa472bc4e0c5ce8d1a75f5e639d7a1ba20835` (`fix: complete formal doctoral proposal workflow`)
- 本轮逐文件收口起点：`906b50b21971ac2baae51d18e6c8e3714e47738a`
- 正式引用失败测试：`c50ee54` (`test: expose formal citation and proposal export gaps`)
- 冻结引用与 Proposal 修复：`8f973b5` (`fix: render formal proposals from frozen citation clusters`)
- Workflow 恢复失败测试：`c1eddc5` (`test: expose orphan assistant workflow recovery gaps`)
- Workflow 恢复修复：`2c17cc6` (`fix: recover orphan assistant workflow runs`)
- 专用 Proposal E2E 加固：`ce04b1a` (`test: exercise versioned formal proposal export path`)
- 实现与验证收口提交：`a01f5ef371a0996bd8fe3acd1556b171c63313dd`

## 2. 修复前失败证据

生产代码修改前，新增的 7 个回归文件全部失败。失败原因分别为：中文相邻句没有切开；`GenerationService` 没有两阶段 `promoteStructuredDraft`；不可变版本缺少正式导出输入与独立 hash；Proposal 导出没有版本快照加载入口；CSL 没有整文档 session；Workflow 没有恢复入口；formal doctoral E2E 因生产入口缺失无法启动。这些失败由 `dda2ade` 固化，未通过改弱断言处理。

本轮追加测试在生产修复前得到以下真实失败：专用 Proposal 收到 `{ formal: true, version }` 时仍读取不存在的 `manuscript` 参数并抛出 `Cannot read properties of undefined (reading 'chapters')`；GB/T CitationCluster 丢失 page locator；缺失 `documentOrder` 的 cluster 没有抛错；三个孤立 WorkflowRun 场景均因 `recoverAndRequeueAssistantWorkflows` 不存在而失败。失败分别固化于 `c50ee54` 和 `c1eddc5`。

## 3. GenerationService

生产调用点为 `lib/generation-service.ts` 的 `auditProvisionalDraft` 和 `promoteStructuredDraft`。结构化草稿先在内存构造 provisional document、Coverage、CitationItem 和精确 Binding，再调用不持久化的 CitationAudit；该阶段不查询伪造的 `preflight-*` 数据库版本。

预审 blocker 会保存 `QuarantinedDraft`，不修改章节、不创建可用版本、不移动 `currentVersionId`。预审通过后先保存 `pending_validation` DocumentVersion；Coverage 和最终 CitationAudit 使用真实 `saved.documentVersion.id`。只有持久化复审无 blocker 才调用 `activateDocumentVersion`。最终失败会标记版本为 `quarantined`。`idempotencyKey` 重试返回同一版本。

## 4. 中文 Coverage 与精确覆盖

`lib/claim-coverage.ts` 直接在原始正文上解析，Citation token 保留等长占位，因此 paragraph、sentence 和 citation offset 保持一致。中文 `。！？；……` 不要求后续空格；英文边界保留对 DOI、URL、小数和缩写的保护。

Formal `covered` 必须同时存在：当前版本句子的明确 Claim、句中 CitationItem、同 Work 的 human-verified EvidenceExcerpt、locator、`supports/qualifies` 关系，以及当前 `documentVersionId` 的精确 Claim-Evidence-Work-Citation Binding。已删除“一个句子加一个 Claim 自动绑定”的数量兜底。分类器失败在 formal 模式产生 `unknown` blocker。

## 5. 不可变正式输入

`DocumentVersion` 冻结 title、research/evidence mode、citation style、章节、Claims、Works、CitationItems、CitationClusters、精确 Bindings、EvidenceExcerpt 内容 hash 与 locator、发表状态、workspace、research plan、研究问题、构念、假设、实验和院校模板。

- `contentHash`：正式正文、citation style、CitationItem 和 CitationCluster 等所有影响正文引用渲染的输入。
- `evidenceBindingHash`：精确 Bindings 与冻结 Evidence references。
- `proposalInputHash`：workspace、research plan、院校模板和 citation style。

FormalExportGate 会重新计算三类快照 hash，拒绝非 `reviewable` 版本、缺少或 hash 不匹配的版本化 QualityReport，以及三类 hash 任一不匹配的 HumanApproval。新增 Binding 会刷新 `evidenceBindingHash` 并删除该版本旧审批。导出旧版本使用 `formalExportSnapshot`，不读取当前 V4 workspace 补写 V3。

## 6. CitationCluster 与正式导出

正式 Markdown、通用 DOCX、ZIP 内的项目文档和专用 Proposal DOCX 都从指定 DocumentVersion 读取冻结 CitationCluster、Works 和 citation style。`lib/citation-service.ts` 的 `renderVersionCitations` 为整份文档建立一个 citeproc session，`renderVersionSectionContent` 负责逐章节 token/cluster 一一替换；formal 渲染失败会抛错，不回退到手工正式引用。

每个新 CitationCluster 写入全局递增 `documentOrder`；`position` 只用于章节内替换。缺失 `documentOrder` 会被 CitationService 和 FormalExportGate 阻断。精确 Binding 只用相同 Claim/Work 的 EvidenceExcerpt 为 CitationItem 补 locator。GB/T CSL 样式由 citeproc 输出页码，例如 `[1, 页 3]`，不是 exporter 手工拼接。

实际测试覆盖 APA locator 和多文献 citeproc cluster；三章节 GB/T 7714-2015 numeric 的跨 cluster 结果为 `[1]`、`[2]`、再次引用第一篇仍为 `[1]`，即使三个章节的 `position` 都相同也保持该顺序。bibliography 顺序为 Work A、Work B。正式正文与参考文献不泄漏 `[[CITE:`、Work ID、Claim ID 或 EvidenceExcerpt ID。

## 7. AssistantWorkflowRun

消息路由现在把“第三章”解析为当前真实文档第三章的 section ID，不再传递虚构的 `chapter-03-main`。worker 执行 Coverage、CitationAudit、Evidence matching、Candidate search、metadata verification、local full-text search 和 AI-suggested excerpt，并停在人工核验门。

`approve-evidence` action 要求项目作用域、同一个 waiting job、WorkflowRun、EvidenceExcerpt 和 reviewer；它把摘录保存为 human-verified，继续同一个 WorkflowRun，并重新入队同一个 job。第二个 worker 实例恢复后生成 revision diff，并停在 revision approval。`apply-revision` 使用真实 `promoteStructuredDraft`，创建一个 DocumentVersion、复审并将同一 WorkflowRun 标记 completed。重复批准不会创建第二个 Candidate、Excerpt 或 Version；人工批准前正文保持不变。

WorkflowRun 在首次创建时保存 conversation、prompt 和 profile，创建 ResearchJob 后立即双向绑定 `job.input.workflowRunId` 与 `workflow.jobId`。worker 每轮在 `claimNextJob` 之前调用 `recoverAndRequeueAssistantWorkflows`：failed/cancelled Job 原地重新 queued；Job 丢失或已完成时创建一个替代 Job 并更新同一个 WorkflowRun；queued/running/paused Job 不重复创建。连续恢复两次只保留一个 Job。

`awaiting_full_text`、`awaiting_human_verification` 和 `awaiting_revision_approval` 不会被 worker 自动跨越。测试实际启动 worker 两次，证明丢失 Job 被恢复且 WorkflowRun ID 不变；人工核验门不会创建替代 Job。export intent 调用完整 FormalExportGate，而不是只运行 CitationAudit。

## 8. Formal Doctoral E2E

`tests/formal-doctoral-proposal.e2e.test.ts` 使用真实 GenerationService、ClaimCoverageService、Binding service、CitationAudit、DocumentVersion、ConsistencyReview、QualityReport、FormalExportGate 和 CitationService。模型、学术检索和 PDF 内容使用无版权的本地 fixture 或可注入 mock。

流程为：两个隔离项目 -> APA 项目切换 GB/T -> 关闭并重开 SQLite -> 两个 verified Work -> publication checks -> 两个本地 PDF asset -> 两条带页码的 human-verified excerpt -> 中文三句结构化章节 -> provisional Coverage/Binding/Audit -> pending DocumentVersion -> 真实 version ID 复审 -> activate -> ConsistencyReview -> versioned QualityReport -> three-hash HumanApproval -> FormalExportGate -> 专用 Proposal exporter -> 正式 Proposal API route -> GB/T DOCX 解包检查。

断言包括：中文三句正确切分；前两条事实分别映射 Claim、CitationItem 和不同 EvidenceExcerpt；Binding 四方严格一致；currentVersion 仅在复审通过后移动；SQLite 重开后项目和新版本仍为 GB/T；DOCX 包含 `[1, 页 3]`、`[2, 页 5]` 和中文题名；Proposal route 文件名绑定 version number；旧版本 DOCX 不受当前 workspace 修改影响；项目 B 不泄漏；缺 QualityReport、错误审批 hash、批准后新增 Binding 均被阻断。

`tests/assistant-workflow-resume.e2e.test.ts` 另行使用真实 worker、消息/API action、Workflow、EvidenceExcerpt 和 GenerationService，外部搜索、Crossref 和模型 HTTP 使用确定性 mock，证明人工核验后恢复及 diff 批准闭环。

## 9. CI 与本地结果

`.github/workflows/ci.yml` 显式执行：`npm ci`、lint、typecheck、全套测试、独立 formal E2E 和 build；临时数据使用 `$RUNNER_TEMP`，结束时清理，不需要真实 API key。

- lint：通过，0 error，0 warning。
- typecheck：通过。
- 全部测试：27 files passed；113 tests passed；0 failed。
- `npm run test:formal-e2e`：1 file passed；1 test passed；0 failed；约 3.0 秒（最近一次单独运行）。
- build：Next.js 15.5.23 production build 成功，35/35 static pages generated。
- `git diff --check`：通过。
- GitHub Actions：run `32335650726`，提交 `a01f5ef371a0996bd8fe3acd1556b171c63313dd`，结论 `success`；链接：https://github.com/watsonbkeel/research/actions/runs/32335650726 。该 run 在当前分支真实执行并通过了 `npm ci`、lint、typecheck、27 files / 113 tests 的全套测试、独立 formal E2E、build 和临时数据清理。

测试日志中的 `standardFontDataUrl` 是 pdf.js 解析最小合成 PDF 时的非阻断 warning；PDF 解析、测试和 build 均成功。

## 10. 已知限制与人工职责

真实运行仍取决于研究者有权使用的全文、可用的模型/元数据服务和正确配置的凭据。外部服务失败保持 unavailable/unknown/blocker，不会伪造 verified 或 clear。

研究者必须亲自核对并批准 EvidenceExcerpt 原文、locator、Claim 关系和方向；处理 checked-unknown publication status；核验院校模板；批准 revision diff；运行一致性/质量复核；最后批准精确版本。AI 和 worker 均不能代替这些人工门。

手工验收：创建 formal prospective 文档；登记并核验 Work 与 publication status；上传有权使用的 PDF；创建带 locator 的 human-verified excerpt；发送“第三章没有参考文献，帮我检查并补充。”；核验证据；审批 diff；运行 Coverage、CitationAudit、ConsistencyReview 和 QualityReport；对三 hash 版本审批；分别导出 APA 与 GB/T，并确认正文无内部 token、参考文献仅含实际引用 Work。

## 追加收口：引用格式与任务绑定

本轮追加修复已提交于 `22389450f77cef0db07ab047ed25f0ecf7804e17`：`Project.citationStyle` 现在有数据库列、幂等迁移、严格 Zod schema、API PATCH 校验和 Workbench 选择器；SQLite 重开后 GB/T 仍保持，旧 DocumentVersion 保留 APA，新 DocumentVersion 保存 GB/T。新 CitationCluster 写入整文档 `documentOrder`，FormalExportGate 阻断缺失顺序的正式版本，citeproc 和正式 exporter 按该顺序处理。AssistantWorkflowRun 现在保存对应 `jobId`、conversation、prompt 和 profile。新增引用格式持久化测试后，本地全套测试为 27 files / 107 tests passed。追加提交的 GitHub Actions run `32331150235` 已 success：https://github.com/watsonbkeel/research/actions/runs/32331150235 。

# P0 第三轮最终收口报告

报告日期：2026-08-19

## 分支与基线

- 开始分支：`codex/p0-final-closure-3`
- 开始 HEAD：`54a4eb1 harden formal evidence workflow and production readiness`
- 修改后分支：`codex/p0-final-closure-3`
- 修改后 HEAD：承载本报告的分支最新提交；精确 hash 以 `git rev-parse HEAD` 和该提交的 GitHub Actions run 为准。
- 修改前基线：lint、typecheck、18 个测试文件/83 个测试、build 均通过。

## 本轮确认并修复的缺陷

1. GitHub Actions 在 job 级环境变量使用不受支持的 `runner.temp`，可能导致工作流无法启动。
2. Claim Coverage 删除 citation token 后丢失位置关系，且章节标题和字符串包含关系可造成错误分类或错误 Claim 绑定。
3. CitationAudit 只验证集合成员关系，无法阻止同一 Bundle 内跨 Claim、跨 Work 错绑。
4. 多条旧导出路由未统一要求明确的不可变 `versionId` 和 FormalExportGate。
5. GB/T 与部分正文引用依赖手工格式化，数字编号和 citation cluster 不稳定。
6. DocumentVersion 未完整保存元数据和证据关系，恢复及 optimistic locking 不够严格，审批未独立版本化。
7. `AssistantWorkflowRun` 创建后 worker 未实际推进引用修复步骤。
8. 迁移统计混用了表，失败后没有完整自动恢复。

## Claim Coverage

Coverage 现在按“原始正文解析 -> 保留 token 和 offset -> 确定性句子边界 -> 可注入结构化分类器 -> Zod 校验 -> 确定性安全复核 -> 报告”执行。`ParsedParagraph` 同时保存 `rawText`、等长占位后的 `plainText`、段落 offset 和每个 CitationItem 的原始位置，因此句子可以直接关联内部或相邻 token，不再删除后猜测。

生产代码包含 OpenAI-compatible 的结构化模型分类器和离线确定性分类器。审计 API 可显式选择模型模式；CI 和无模型环境使用确定性实现。模型超时、异常或非法输出会生成 `unknown`，formal 模式将其作为 blocker。章节标题只提供上下文，不能把 theory、definition 或 method 章节中的事实自动变成免来源内容。模型返回的多个 `claimSpans.suggestedClaimId` 可将一句话关联到多个 Claim；未提供结构化跨度时仍保留有限兼容匹配，不能据此放行 formal 未覆盖事实。

CoverageReport 精确记录 `documentVersionId`、正文 `contentHash`、分类器版本、段落/句子数据和 published fact/unknown 统计。新版本或 hash 变化后旧报告不能用于 FormalExportGate。

## 精确证据链

新增持久化 `ClaimEvidenceCitationBinding`，逐条绑定 project、document、version、section、sentence、Claim、EvidenceExcerpt、Work 和 CitationItem。写入服务验证当前版本、Coverage 句子、Claim 所属章节、Excerpt 的 Claim/Work、CitationItem 的 Work、项目隔离、Work 书目核验和证据方向；SQLite 增加唯一索引与检索索引，SQLite 无法表达的跨 JSON/复合一致性在同一服务事务边界中强制验证。

CitationAudit 现在阻断跨 Claim excerpt、excerpt/work 不一致、citation/work 不一致、旧版本或失效 sentence、orphan citation、orphan evidence、Candidate/未核验 Work、formal 非 human-verified excerpt，以及把 contradicting evidence 当作唯一 supporting evidence的情况。

## FormalExportGate 与旧路由

所有正式导出都必须提供 `projectId`、`documentId` 和 `versionId`。Gate 加载指定 DocumentVersion，重新计算快照 hash，并针对该快照检查同版本和同 hash 的 Coverage、CitationAudit、ConsistencyReview、独立 HumanApproval、必填章节、机构、书目核验和 publication status。导出渲染使用该不可变快照，而不是当前正文。

`unchecked`、检查失败、`retracted`、`expression_of_concern` 和未经版本化人工确认的 `checked + unknown` 均阻断；`corrected` 产生 warning。unknown override 只对指定 Work 和指定 DocumentVersion 生效，不能用于撤稿或关注表达。

以下路由已统一转入版本化 gate/导出服务：`/api/export`、Markdown、DOCX、BibTeX、Proposal、项目文档导出和项目 ZIP bundle。ZIP 对每个指定文档版本分别运行 Gate。旧 `/api/manuscript` 与 `/api/manuscript/versions` 返回 `410 Gone`。草稿 Markdown/DOCX 带有“研究草稿”警示、versionId、blocker/warning 数量和导出时间。

## CSL 引用

APA 7 使用 Citation.js/citeproc-js；GB/T 使用仓库内真实 CSL 样式 `china-national-standard-gb-t-7714-2015-numeric.csl` 和 `locales-zh-CN.xml`。UI/README 只声明 APA 7 与 GB/T 7714-2015 numeric。结构化 `CitationCluster` 支持 locator、prefix/suffix 和 suppressAuthor 数据，citeproc 负责 cluster 与参考文献输出；数字样式维护稳定 Work 编号，重复引用不会漂移。

回归测试验证 APA locator、多来源 cluster、同作者同年份后缀、真实 GB/T bibliography、首次编号 `[1]`/`[2]`、重复渲染稳定，以及导出不泄漏 `[[CITE:` 或内部 ID。当前正文 token 仍以 `[[CITE:work-id]]` 为主要存储格式；locator 的完整结构化持久化需要调用 `CitationCluster` 路径，这是已知限制。

## DocumentVersion 与并发

快照包含标题、research/evidence mode、目标机构/venue、完整章节、unsupportedStatements、evidenceGaps、Claim/Citation/Excerpt ID、精确 Binding、报告 ID 和逐层 contentHash。修改标题、模式、章节、结构化证据关系、应用助手 diff 或恢复旧版本都会创建新版本；新版本不继承旧审批。

写入使用 `BEGIN IMMEDIATE`，在事务中读取并比较 `expectedVersion`，然后写快照和 currentVersion 指针。恢复会精确重建目标快照并删除目标版本不存在的后来章节，恢复动作本身产生新版本，不改写历史。`/versions` 返回整文档 DocumentVersion，section DraftVersion 仅保留为内部编辑历史。

## AssistantWorkflowRun

章节引用修复 worker 现在实际执行版本/章节加载、Coverage、CitationAudit、现有证据匹配、候选检索、书目核验、本地全文搜索和 AI suggested excerpt 创建。缺少全文时停在 `awaiting_full_text`；存在建议摘录时停在 `awaiting_human_verification`；证据经人工确认后生成 diff 并停在 `awaiting_revision_approval`。批准 diff 后 API 进入 applying、创建新 DocumentVersion、reaudit 并完成。

每个步骤保存状态、时间和摘要；写操作使用 workflow/idempotency key 防止重复对象。AI 不能自行把 excerpt 标为 human_verified，也不能批准修订、publication unknown 或正式导出。现有 job lease recovery 可在 worker 重启后重新领取未完成任务。

## Migration

迁移统计现在分别统计 projects、documents、document_versions、sections、candidates、works、verification/publication events、claims、claim links、evidence excerpts、full text、assistant records、audits、reviews、coverage 和 approvals，不再用 `claim_evidence_links` 代替 Claim 或用 FullTextAsset 代替 EvidenceExcerpt。

备份流程执行 WAL FULL checkpoint、SQLite `VACUUM INTO`、SHA-256 和可打开性/完整性校验。迁移失败会 rollback、记录失败日志、关闭连接、用已验证备份恢复、重新打开、执行 `PRAGMA integrity_check` 并确认 schema marker 未被错误提交。测试覆盖正确统计、失败自动恢复和重复迁移基础行为。

## 验证结果

- workflow：`.github/workflows/ci.yml` 可解析，包含 `workflow_dispatch`，使用 `$RUNNER_TEMP` + `mktemp -d`，执行 `npm ci`、lint、typecheck、test、build，并在 `always()` 清理临时目录。
- lint：通过，`eslint .` exit 0。
- typecheck：通过，`tsc --noEmit --incremental false` exit 0。
- test：19 个测试文件、97 个测试全部通过。
- build：Next.js 15.5.23 production build 通过，35/35 静态页面生成。
- `git diff --check`：通过。
- 新增测试文件：`tests/p0-final-closure.test.ts`，14 个针对性回归测试；同时更新既有 P0 测试断言。
- GitHub Actions：报告创建时尚未推送；推送后以分支最新 run ID、URL 和结论补充到最终交付说明，不在未验证时声称通过。

## 已知限制

1. 本轮没有实现任务书要求的 2 项目、30 Candidate、50 Claim 的单一超大 E2E fixture；现有 97 个测试以服务级、路由级、worker 级和导出级回归覆盖关键阻断规则。
2. 没有新增覆盖所有历史中文状态和全部旧对象组合的“完整复杂 golden database”；已增加真实 SQLite 统计和失败恢复测试。
3. QualityReport 尚未形成与 Coverage/Audit/Consistency 相同的独立 version/hash 强制绑定，因此报告不宣称该项完整闭环。
4. Assistant 引用修复已有生产状态推进和人工门槛，但没有新增一条从真实外部检索一直运行到人工批准 diff 的单体 E2E；外部服务在 CI 中按要求 mock。
5. workflow 重启恢复依赖现有持久化 job lease recovery，并非独立扫描所有孤立 WorkflowRun 的专用守护器。
6. CSL 已支持结构化 locator API，但旧正文 token 本身尚未序列化 locator/prefix/suffix 的全部字段。

以上限制保持 fail-closed：无法核验时标记 unknown/unavailable/blocked，不生成虚假 clear、verified 或正式导出。

## 研究者仍需人工完成

- 核对并批准 EvidenceExcerpt 的原文、定位、方向与 Claim 对应关系。
- 阅读 corrected 文献的更正内容，并处理 checked+unknown 的版本化人工决定。
- 批准章节 diff、ConsistencyReview 结果和指定 DocumentVersion。
- 确认目标院校/机构模板与正式提交要求。
- 确保上传全文具有合法访问权限，并在 Word 中更新目录字段。

## 手工验收步骤

1. 创建 formal 文档版本，在 theory 章节加入无来源事实，确认 Coverage/FormalExportGate 阻断。
2. 为 Claim A 尝试绑定 Claim B 的 excerpt，确认 API 拒绝；再建立精确 Binding 并重跑 CitationAudit。
3. 对同一版本依次运行 Coverage、CitationAudit、ConsistencyReview、HumanApproval 和 FormalExportGate。
4. 将 cited Work 标为 unchecked、retracted、expression_of_concern 和 checked+unknown，验证对应阻断与版本化 override。
5. 导出 APA 和 GB/T numeric，检查 locator、组合引用、稳定编号、参考文献排序和内部 token 清除。
6. 运行“第三章没有参考文献，帮我检查并补充”，验证 workflow 在全文、证据核验和 diff 批准门槛停留并可恢复。
7. 制造迁移中途失败，确认备份 checksum、自动恢复和 `PRAGMA integrity_check`。

# UI / Evidence Hotfix 1 报告

## 范围与提交

- 开始分支：`codex/ui-completion-staging-1`
- 开始 commit：`5de6614ed4ca71ae3b63c18caa20ae688257bf52`
- 完成分支：`codex/ui-evidence-hotfix-1`
- 完成 commit：`c12357b`（本文件所在的最终 hotfix 提交）
- 本轮未修改 `FormalExportGate`、GenerationService、Claim Coverage、CitationService、Proposal exporter 或 Job / Workflow 并发逻辑。

## 修复内容

1. 定位字段互斥：更新时先计算最终 `locatorType`。`page` 类型只保存 `page`，非 page 类型只保存 `locator`；类型切换会显式清空另一字段。表单 adapter 对 PATCH 使用 `null` 表示明确清空，兼容旧的 page-through-locator 数据但不会继续持久化冲突字段。
2. 人工核验失效：以下 material evidence fields 任一改变都会把旧 `human_verified` 降为 `unverified`，并清除 `reviewer` / `reviewedAt`：`workId`、`fullTextAssetId`、`quote`、`paraphrase`、`page`、`locatorType`、`locator`、`claimId`、`supportDirection`。空白和 null/undefined 会先标准化；仅修改 `strength`、`relevance`、权限字段不会自动失效。
3. Claim PATCH 校验：service 对最终 Claim ID 重新读取当前项目 workspace，Claim 不存在或属于其他项目时拒绝写入；创建和更新路径使用相同的项目归属检查。
4. Work / 全文资产联动：切换 Work 时通过 `changeEvidenceWork()` 清空旧 `fullTextAssetId`；资产列表同时按当前项目和 Work 过滤；已有非法旧资产会在编辑器加载后清空。保存提示用户重新选择 PDF。
5. 院校模板作用域：`availableSectionsForInstitutionEditor()` 只从项目 `confirmation-proposal` 文档提供 section 映射。当前打开 Journal Article 等其他文档不会改变来源；没有 Confirmation Proposal 时映射控件禁用并提示，已有值保留。

## 测试与验证

- 先提交失败测试：`664b495 test: expose remaining evidence editor integrity gaps`。旧实现分别暴露定位残留、核验状态污染、Claim PATCH 未校验，以及两个 UI helper 缺失。
- 修复提交：`629daee fix: invalidate stale evidence verification on edits`。
- `tests/evidence-edit-integrity.e2e.test.ts` 使用真实项目级 route、EvidenceExcerpt service、SQLite、两个 Work、两个 PDF asset 和表单 adapter，覆盖 page→chapter、重新核验、Claim 变更、跨项目 Claim 拒绝、Work/asset 切换。
- 最终本地测试文件数：46；测试总数：173（173 passed）。
- `npm run lint`：通过。
- `npm run typecheck`：通过。
- `npm test -- --run`：通过。
- `npm run test:formal-e2e`：通过，formal doctoral proposal E2E 继续通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- GitHub Actions run ID：`32442820944`；`verify` job `success`，workflow `completed / success`。

## Deferred findings

- 旧数据的物理 JSON 清理仍在读取兼容层完成；用户编辑并保存后会写入互斥字段形态。未在本轮增加破坏性全库迁移。
- 浏览器真实交互、真实大学模板、真实论文 PDF 与 Word 打开检查仍需 staging 人工验收。

## 结论

已修复 UI 与证据编辑完整性缺口，代码与自动 E2E 已通过，可进入真实论文和浏览器 staging 验收。该结论不表示自动保证任何院校的博士开题通过，也不替代人工核验。

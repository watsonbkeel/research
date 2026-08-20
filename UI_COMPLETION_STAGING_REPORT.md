# UI Completion Staging Report

## 范围与基线

- 开始分支：`codex/production-hardening-1`
- 开始 commit：`3cb26b30309104cab6f39f14d6f7888fc7d22681`
- 完成分支：`codex/ui-completion-staging-1`
- 完成 commit：待本提交完成后填写
- 本轮只处理两个 UI 缺口：结构化院校模板无法完整编辑；EvidenceExcerpt 无法通过网页创建/修复明确 `locatorType`。
- 未修改生成、证据闭环、CitationService、FormalExportGate、Assistant 或 project-document 后端主链。

## 实现摘要

`InstitutionProfileEditor` 现在单独编辑 University、Faculty、School、Program、milestone、word/page limit、official source、核验信息、六类正式要求和结构化 requiredSections。每个 requiredSection 支持 key、label、required、sectionId、sectionKey、aliases、minimumCharacters，以及上移、下移和删除。

`lib/institution-form.ts` 会把旧字符串 requiredSections 转为稳定 key、原始 label、aliasesText 和 required=true 的表单行；结构化对象经 `institutionFormToProfile` 再保存时保留映射字段和 minimumCharacters。`verified` 状态前端要求 `verifiedBy` 与 `verifiedAtLocal`，保存时转换为 ISO datetime；非 verified 状态会明确提示 FormalExportGate 不会视为已核验。

`EvidenceExcerptEditor` 提供 `page`、`chapter`、`section`、`paragraph`、`figure`、`table` 六种定位类型。page 只发送 `page`；其他类型只发送 `locator + locatorType`。切换类型会清理不适用的定位字段。`human_verified` 必须填写 reviewer 与 reviewedAtLocal，并发送 canonical `reviewedAt` ISO 值。

已有 EvidenceExcerpt 会在表格中显示定位类型、定位值、核验状态、核验者和核验时间，并提供编辑与删除操作。旧的无类型 locator 显示“定位类型待确认”，选择类型后通过项目级 PATCH 修复。新页面只使用：

- `/api/projects/:projectId/institution`
- `/api/projects/:projectId/evidence-excerpts`

项目级路由测试确认路径 projectId 覆盖 query scope，结构化 requiredSections round trip 不丢字段，locatorType 校验和项目隔离仍由真实后端完成。

## 测试证据

- 失败测试先于生产代码提交，原因是旧页面没有适配器和独立编辑器模块。
- UI 测试文件：7 个；测试数：17 个，全部通过。
- 全部测试：40 个文件，158 个测试，全部通过。
- `npm run lint`：通过，无错误或警告。
- `npm run typecheck`：通过。
- `npm test -- --run`：通过，40 files / 158 tests。
- `npm run test:formal-e2e`：通过，1 test。
- `npm run build`：通过，Next.js production build 成功。
- `git diff --check`：通过。
- UI formal-readiness E2E 使用真实项目级路由、DocumentVersion、EvidenceExcerpt service 和 FormalExportGate；不是只检查返回对象，也没有构造绕过 UI adapter 的专用 payload。

## CI 与 staging 状态

- GitHub Actions workflow `.github/workflows/ci.yml` 已显式执行 `npm ci`、lint、typecheck、全部测试、formal E2E 和 build。
- GitHub Actions run ID/status：待推送 `codex/ui-completion-staging-1` 后记录；远程 CI 未通过前不宣称本轮 staging 完成。
- 真实 staging 尚未执行；请按 [STAGING_ACCEPTANCE_CHECKLIST.md](./STAGING_ACCEPTANCE_CHECKLIST.md) 完成人工验收。
- 准确结论：UI 闭环完成，代码与受控 E2E 通过，已具备真实 staging 验收条件。

## Deferred findings

- 未引入真实院校来源抓取或自动合规判断；模板内容仍需用户根据官方材料核验。
- 未改变旧 legacy API；它们继续作为兼容入口存在，但本轮新 UI 不再调用。
- 未加入浏览器自动化框架；组件契约使用 `renderToStaticMarkup`，项目级 API、版本和 Gate 使用真实受控 E2E。

## 人工 staging 验收

需要人工确认：真实学校模板字段、官方来源和核验记录；合法 PDF 与全文权限；六种定位在 Word 输出中的表现；worker 重启和人工门行为；APA/GB/T 旧版本输出 hash 稳定性；数据库与 `.local` 备份恢复。

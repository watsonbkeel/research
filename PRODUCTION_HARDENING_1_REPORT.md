# Production Hardening 1 Report

## 1. 基线与提交

- 开始分支：`codex/formal-e2e-final-fix`
- 开始 commit：`8aa835e29964de840ea944d9baff84da6aa9d768`
- 完成分支：`codex/production-hardening-1`
- 失败测试提交：`c8c23b5` (`test: expose formal gate and concurrency risks`)
- 院校与 locator 修复提交：`0a345d3` (`fix: harden formal institution and locator checks`)
- 生产实现完成 commit：`168d0982e9083113400c45396acbae708b55ed4c`

## 2. 修复前失败证据

生产修复前单独运行六个新文件，结果为 6 files failed，18 tests 中 16 failed、2 passed。具体原因是：

- `formal-export-required-sections` 和 `institution-profile-gate`：生产代码没有逐项院校验证函数，FormalExportGate 只检查 chapter 是否全空及当前 project institution 字符串。
- `assistant-job-concurrency`：`assistant_jobs` 没有 WorkflowRun 活动 Job 部分唯一索引，`claimNextJob` 不检查条件 UPDATE 的 changes。
- `assistant-workflow-concurrency`：Job schema 没有 `workflow_run_id`，恢复扫描和 Job 创建/绑定分属多个非原子写操作。
- `citation-locator-type`：chapter、section、paragraph、figure、table 全部被 hydration 改成 `page`，旧的无类型 locator 也被猜成 page。
- `citation-style-transaction`：原子服务不存在；API 先更新 Project，再在路由中逐文档创建版本。

后续将并发测试加固为两个独立 `tsx` 子进程/独立 SQLite 连接，通过文件 barrier 同时进入领取或恢复事务；不是顺序调用模拟并发。

## 3. 院校正式门槛

`InstitutionRequiredSection` 支持 `key`、`label`、`sectionId`、`sectionKey`、`aliases`、`required` 和模板显式配置的 `minimumCharacters`。旧的字符串数组仍可读取，但只做标准化后的精确名称匹配。

映射顺序为：精确 `sectionId` -> 精确 `sectionKey` -> 标准化后的 label/alias 精确匹配。标准化仅处理 Unicode 形式、大小写、空白和常见中英文标点，不使用模糊相似度。

FormalExportGate 只把指定 `DocumentVersion.institutionProfileSnapshot` 和 `version.sections` 传入验证器。它逐项产生：

- `institution-required-section-unmapped`
- `institution-required-section-missing`
- `institution-required-section-empty`
- `institution-required-section-below-minimum`

blocker 携带 required key、label、映射 sectionId、当前字符数和最低字符数。集成测试证明：当前文档后来补齐内容时，旧空版本仍被 blocker；新版本才使该项通过。

## 4. InstitutionProfile 核验与版本

正式版本必须有可解析的 profile，且 `verificationStatus === "verified"`、`verifiedBy` 非空、`verifiedAt` 存在。对应 blocker 为 `institution-profile-missing`、`institution-profile-unverified`、`institution-profile-verifier-missing` 和 `institution-profile-verification-time-missing`。

institution PUT 路由调用 `saveInstitutionProfileWithDocumentSnapshots`：事务内保存 profile，并为项目每份文档创建冻结新 profile 的 `not_reviewed` 版本。旧版本及旧审批不变。测试证明：当前 profile 后来 verified 不会使旧版本通过，新快照才不再产生 profile 核验 blocker。

## 5. Job 原子领取

`claimNextJob` 现在执行 `BEGIN IMMEDIATE` -> 按原有 `created_at,id` 顺序选取 queued Job -> `WHERE status='queued'` 条件 UPDATE -> 检查 `changes === 1` -> 插入唯一 running event -> COMMIT。lease owner、expiry、running status 和 event 在同一事务。任意异常执行 ROLLBACK。

真实并发测试使用两个独立进程：一个 queued Job 只有一个 worker 返回 Job，只有一个 lease owner 和一条 running event；两个 queued Job 被两个 worker 分别领取，Job ID 不同。SQLite 连接设置 `busy_timeout=5000`，CI 中同样通过。

## 6. WorkflowRun 原子恢复

`assistant_jobs` 新增 `workflow_run_id` 列和部分唯一索引：

```sql
CREATE UNIQUE INDEX idx_assistant_jobs_one_active_per_workflow
ON assistant_jobs(workflow_run_id)
WHERE workflow_run_id IS NOT NULL
  AND status IN ('queued','running','paused');
```

`recoverAssistantWorkflowJobAtomically` 在 `BEGIN IMMEDIATE` 内重读 WorkflowRun state，查询活动 Job，原地重排 failed/cancelled Job 或创建 replacement，再回写同一 run 的 payload/jobId。并发恢复一个孤立 run 的结果固定为一个 `created`、一个 `existing`，且两者指向同一 Job。failed Job 竞争只有一次 requeue。

`awaiting_full_text`、`awaiting_human_verification`、`awaiting_revision_approval`、`completed`、`blocked` 和 `failed` 不在自动恢复集合中。两个并发 worker 对 human-verification gate 都返回 `not-resumable`，不创建 Job。

## 7. 迁移和旧数据

幂等 migration `assistant-workflow-active-job-v1` 添加/回填 `workflow_run_id`，并建立部分唯一索引。如旧库已有重复活动 Job，保留最早项，其余项改为 cancelled，保留原记录并写入 `migration-duplicate-cancelled` event，不删除历史 Job。

EvidenceExcerpt JSON 迁移规则是：旧 `page` 非空安全补为 `locatorType=page`；旧数据只有 `locator` 时保留 undefined，不猜测。新数据有 locator 时必须明确 `locatorType`。chapter、section、paragraph、figure 和 table 在 CitationItem hydration 中保持原类型。无类型正式 Binding 产生 `citation-locator-type-missing`。

locatorType、locator 和 page 均进入 evidence reference 快照及 `evidenceBindingHash`；CitationItem 中的 locatorType/locator 继续进入 `contentHash`。

## 8. citationStyle 整体事务

`updateProjectCitationStyleAtomically` 使用同一 portfolio SQLite 连接执行 `BEGIN IMMEDIATE`：重读 Project 并校验可选 `expectedProjectUpdatedAt`，列出文档，同时更新 Project 与 workspace citationStyle，为每份文档创建新冻结版本并更新 current pointer，最后 COMMIT。普通 `updateProject` 现在拒绝未授权的 citationStyle 变更，API 不再存在先改 Project 再循环 snapshot 的旁路。

回滚测试创建三份文档和一条旧审批，再用 SQLite `BEFORE INSERT` trigger 在第二份文档的 snapshot 中执行 `RAISE(ABORT, 'forced snapshot failure')`。失败后重新查询数据库，Project 仍为 APA，三个 currentVersionId 及版本数都不变，旧审批仍存在。删除 trigger 重试后，三份文档各新增一个 GB/T、`not_reviewed` 版本；再次请求同格式时新版本数为零。

## 9. 验证结果

- `npm run lint`：通过，0 error。
- `npm run typecheck`：通过。
- `npm test -- --run`：33 files passed，141 tests passed，0 failed。
- `npm run test:formal-e2e`：1 file passed，1 test passed，0 failed。
- `npm run build`：Next.js 15.5.23 production build 通过，35/35 static pages generated。
- `git diff --check`：通过。
- GitHub Actions：run `32343086807`，head `168d0982e9083113400c45396acbae708b55ed4c`，状态 `completed`，结论 `success`。https://github.com/watsonbkeel/research/actions/runs/32343086807

Actions 真实执行了 `npm ci`、lint、typecheck、全套测试、独立 formal E2E、build 和临时数据清理。无真实外部 API 或模型 Key。

## 10. 修改范围说明

未修改 `generation-service`、`claim-coverage`、`citation-service`、`proposal-exporter` 或 `structured-draft`。范围外的必要修改为：

- `lib/evidence-excerpts.ts`：任务明确要求新 EvidenceExcerpt 拒绝无类型 locator，并安全读取旧 page；仅在 `project-documents` 修改 hydration 无法阻止新坏数据入库。
- `app/api/institution/route.ts`：这是院校模板的实际生产写入入口；不转调版本化服务就无法保证 profile 变化创建 DocumentVersion。
- 既有 formal E2E 和 P0 fixture：仅补入明确 verified institution metadata 与新 locatorType，没有降低审查断言。

## 11. Deferred findings

- DoctoralWorkbench 的院校 required-section 编辑器仍是旧的“每行一个名称”界面；结构化 sectionId/sectionKey/minimumCharacters 以及 verifiedBy/verifiedAt 需通过受控 API 或配置导入录入。FormalExportGate 会阻断信息不完整的 profile，不会降级放行。本轮按约束未扩大为 UI 重构。
- pdf.js 在最小合成 PDF fixture 中输出 `standardFontDataUrl` warning；PDF 解析、测试和 build 都成功。

## 12. Staging 人工验收

1. 导入一份含三个必填 section 的院校模板，填入 verifiedBy、verifiedAt 和来源说明；逐项置空验证 blocker metadata。
2. 保留一个旧未核验版本，再核验当前模板；确认旧版本仍被阻断，新版本需重新质量审查和审批。
3. 同时启动两个 worker 实例，观察单 Job 的 lease owner/running event 以及孤立 WorkflowRun 的 replacement Job 数量。
4. 分别建立 page、chapter、section、paragraph、figure 和 table locator，观察快照、Gate 和 APA/GB/T 输出；无 locatorType 数据应被阻断。
5. 在多文档项目中变更 citationStyle，核对所有 currentVersionId 同时变化，旧版本输出不变，新版本没有继承审批。

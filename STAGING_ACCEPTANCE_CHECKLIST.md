# Staging Acceptance Checklist

本清单用于真实 staging 试用。代码与受控 E2E 通过不等于已满足任意院校的正式要求；每项需要在 staging 环境实际勾选并记录操作者、时间和数据目录。

## 项目与隔离

- [ ] 创建项目 A。
- [ ] 创建项目 B。
- [ ] 确认院校模板、Work、EvidenceExcerpt 和 DocumentVersion 不会串项目。
- [ ] 备份 staging 数据库与 `.local` 目录，并在副本上验证恢复。

## 院校模板

- [ ] 填写真实 University、Faculty、School、Program 和 milestone。
- [ ] 填写 Official URL 与 source access date。
- [ ] 填写 `verifiedBy`、`verifiedAt` 和 `sourceNote`。
- [ ] 逐项添加并映射 requiredSections，确认 sectionId / sectionKey / aliases 优先级。
- [ ] 设置并验证 minimumCharacters。
- [ ] 保存后确认响应提示受影响文档数量，并确认当前文档获得新的不可变版本。
- [ ] 修改当前模板后确认旧版本仍显示原院校快照，旧版本 Gate 不会因为当前模板变化而通过。

## 文献与证据

- [ ] 导入 10–20 篇 Candidate，人工核验 5–10 篇 Work。
- [ ] 上传至少 5 篇有权使用的 PDF，并确认本地解析页数。
- [ ] 创建 page locator。
- [ ] 创建 chapter locator。
- [ ] 创建 section locator。
- [ ] 创建 paragraph locator。
- [ ] 创建 figure locator。
- [ ] 创建 table locator。
- [ ] 将 EvidenceExcerpt 标记为 `human_verified`，填写 reviewer 与 reviewedAt。
- [ ] 编辑一条旧的无 locatorType 记录，确认页面先提示待确认，补齐后使用 PATCH 保存。
- [ ] 删除一条测试 EvidenceExcerpt，并确认只影响当前项目。

## AI 工作流

- [ ] 发送“第三章没有参考文献，帮我检查并补充”。
- [ ] 在 `awaiting_human_verification` 时重启 worker，确认人工门没有被自动跨越。
- [ ] 批准 EvidenceExcerpt。
- [ ] 批准 revision diff。
- [ ] 确认只创建一个新的 DocumentVersion，WorkflowRun 与 Job 可双向追踪。

## 正式导出

- [ ] 运行 Claim Coverage、CitationAudit、ConsistencyReview 和 QualityReport。
- [ ] 完成人工批准，并确认审批绑定当前 versionId。
- [ ] 运行 FormalExportGate，确认所有 requiredSections、verified 模板和 locatorType blocker 已清除。
- [ ] 导出 APA DOCX。
- [ ] 切换项目为 GB/T 7714，确认新版本记录新格式。
- [ ] 导出 GB/T DOCX。
- [ ] 在 Word 中检查页码/非页码定位、中文题名、参考文献顺序和标题页格式。
- [ ] 确认正文没有 `[[CITE:`、Work ID、Claim ID 或 Excerpt ID。
- [ ] 重新导出旧版本并比较 hash，确认当前 workspace 修改不改变旧版本输出。

## 记录

- Staging 数据目录：
- 操作者：
- 验收时间：
- 失败项与处理记录：

import type { WorkspaceData } from "@/lib/types";

// This is an empty, domain-neutral bootstrap record. Real research projects are
// created by the user and persisted under their own projectId; no example study
// is allowed to leak into generated drafts or exports.
export const seedWorkspace: WorkspaceData = {
  schemaVersion: 4,
  project: {
    id: "project-empty-bootstrap",
    titleEn: "Untitled doctoral research project",
    titleZh: "未命名博士研究项目",
    field: "待明确",
    context: "待明确",
    institution: "待指定院校",
    primaryOutcome: "待明确",
    secondaryOutcome: "待明确",
    designLanguage: "中文",
    writingLanguage: "English",
    citationStyle: "APA 7",
    version: "v0.1",
  },
  confirmation: [
    { id: "c1", category: "研究基础", title: "问题重要性与研究背景", status: "未开始", evidence: "待研究者登记" },
    { id: "c2", category: "研究基础", title: "批判性文献综述", status: "未开始", evidence: "待检索并核验证据" },
    { id: "c3", category: "理论", title: "理论基础与概念模型", status: "未开始", evidence: "待研究者登记" },
    { id: "c4", category: "研究设计", title: "研究问题与预注册假设", status: "未开始", evidence: "待研究者登记" },
    { id: "c5", category: "研究设计", title: "方法、样本与分析计划", status: "未开始", evidence: "待研究者登记" },
    { id: "c6", category: "贡献", title: "原创性与知识贡献证据", status: "未开始", evidence: "待证据审查" },
    { id: "c7", category: "执行", title: "可行性、资源与时间表", status: "未开始", evidence: "待研究者登记" },
    { id: "c8", category: "治理", title: "伦理、隐私与数据管理", status: "未开始", evidence: "待目标机构确认" },
    { id: "c9", category: "院校", title: "院校 Confirmation 要求", status: "未开始", evidence: "待加入官方来源" },
    { id: "c10", category: "答辩", title: "书面材料与口头答辩准备", status: "未开始", evidence: "待形成英文开题全文" },
  ],
  works: [], theories: [], constructs: [], experiments: [], claims: [], novelty: [], updatedAt: new Date(0).toISOString(),
};

import { z } from "zod";
import type { ModelProfile, ModelSettings, TaskRoute, TaskType } from "./types";

export const checklistStatusSchema = z.enum(["未开始", "进行中", "已满足", "待确认"]);

export const checklistUpdateSchema = z.object({
  id: z.string().min(1),
  status: checklistStatusSchema,
});

export const evidenceStatuses = [
  "unverified",
  "verified",
  "partial_match",
  "mismatch",
  "failed",
  "DOI已核对",
  "书目信息已核对",
  "摘要已核对",
  "全文已阅读",
  "论断证据已定位",
] as const;

export const workImportSchema = z.object({
  title: z.string().min(3).max(500),
  authors: z.string().max(1000).default(""),
  authorsStructured: z.array(z.object({ family: z.string().min(1).max(200), given: z.string().max(200).optional(), orcid: z.string().max(100).optional() })).max(100).optional(),
  year: z.number().int().min(1800).max(2100),
  venue: z.string().max(500).default(""),
  sourceType: z.enum(["journal-article", "book", "chapter", "conference-paper", "thesis", "report", "web-page", "dataset"]).optional(),
  containerTitle: z.string().max(500).optional(),
  volume: z.string().max(100).optional(),
  issue: z.string().max(100).optional(),
  pages: z.string().max(100).optional(),
  publisher: z.string().max(500).optional(),
  isbn: z.string().max(100).optional(),
  issn: z.string().max(100).optional(),
  url: z.string().url().optional(),
  accessedDate: z.string().max(40).optional(),
  database: z.string().max(200).optional(),
  identifiers: z.record(z.string(), z.string().max(300)).optional(),
  abstract: z.string().max(30000).optional(),
  authorKeywords: z.array(z.string().max(200)).max(100).optional(),
  indexKeywords: z.array(z.string().max(200)).max(100).optional(),
  doi: z.string().max(300).optional(),
  relevance: z.string().max(1000).default("待人工评估与全文核验。"),
});

export const taskTypes = [
  "literature_search",
  "literature_summary",
  "evidence_verification",
  "chinese_research_design",
  "english_academic_writing",
  "citation_validation",
  "translation",
  "formatting",
] as const satisfies readonly TaskType[];

export const taskTypeSchema = z.enum(taskTypes);

export const generationRequestSchema = z.object({
  projectId: z.string().min(1).max(120).optional(),
  documentId: z.string().min(1).max(120).optional(),
  section: z.enum(["methods", "background", "literature_review", "theory", "contribution", "results"]).optional(),
  taskType: taskTypeSchema.default("english_academic_writing"),
  profileId: z.string().min(1).max(100).optional(),
  prompt: z.string().min(1).max(30_000).optional(),
  context: z.record(z.string(), z.unknown()).default({}),
}).superRefine((input, ctx) => {
  if (!input.section && !input.prompt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "必须提供章节或任务提示词。" });
  }
});

export const connectionTestSchema = z.object({
  profileId: z.string().min(1).max(100),
});

export const localSecretUpdateSchema = z.object({
  profileId: z.string().min(1).max(100),
  apiKey: z.string().min(1).max(2000).refine((value) => !/[\r\n]/.test(value), "API Key不得包含换行符。"),
});

const modelBaseUrlSchema = z.string().url().refine(
  (url) => url.startsWith("https://") || /^http:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(url),
  { message: "模型端点必须使用 HTTPS，或指向 localhost/127.0.0.1。" },
);

export const modelProfileSchema: z.ZodType<ModelProfile> = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  provider: z.string().min(1).max(100),
  baseUrl: modelBaseUrlSchema,
  model: z.string().min(1).max(200),
  apiKeyRef: z.string().regex(/^[A-Z][A-Z0-9_]*$/, "API Key引用必须是环境变量名称。"),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(100000),
  notes: z.string().max(2000),
}).strict();

export const taskRouteSchema: z.ZodType<TaskRoute> = z.object({
  taskType: taskTypeSchema,
  defaultProfileId: z.string().min(1).max(100).nullable(),
  fallbackProfileIds: z.array(z.string().min(1).max(100)).max(50),
});

export const modelSettingsSchema: z.ZodType<ModelSettings> = z.object({
  profiles: z.array(modelProfileSchema).max(100),
  routes: z.array(taskRouteSchema).max(taskTypes.length),
  allowFullText: z.boolean(),
}).superRefine((settings, ctx) => {
  const profileIds = new Set<string>();
  settings.profiles.forEach((profile, index) => {
    if (profileIds.has(profile.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["profiles", index, "id"], message: "模型配置ID必须唯一。" });
    }
    profileIds.add(profile.id);
  });

  const routeTypes = new Set<TaskType>();
  settings.routes.forEach((route, index) => {
    if (routeTypes.has(route.taskType)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routes", index, "taskType"], message: "每种任务只能有一个路由。" });
    }
    routeTypes.add(route.taskType);
    const referenced = [route.defaultProfileId, ...route.fallbackProfileIds].filter((id): id is string => Boolean(id));
    referenced.forEach((id) => {
      if (!profileIds.has(id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["routes", index], message: `路由引用了不存在的模型配置：${id}` });
      }
    });
  });
});

export const settingsUpdateSchema = modelSettingsSchema;

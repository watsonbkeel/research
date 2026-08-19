import { z } from "zod";

export const assistantIntents = ["qa", "idea_assessment", "topic_comparison", "literature_search", "bibliographic_verification", "full_text_search", "evidence_extraction", "unsupported_claims", "citation_audit", "consistency_review", "section_draft", "section_revision", "proposal_generation", "export", "job_control"] as const;
export type AssistantIntent = (typeof assistantIntents)[number];
export const assistantPlanSchema = z.object({ intent: z.enum(assistantIntents), confidence: z.number().min(0).max(1), readOnly: z.boolean(), projectId: z.string().optional(), documentId: z.string().optional(), sectionId: z.string().optional(), requestedActions: z.array(z.string()).max(20) }).strict();
export type AssistantPlan = z.infer<typeof assistantPlanSchema>;

const features: Array<[AssistantIntent, string[], boolean]> = [
  ["citation_audit", ["引用", "参考文献", "citation", "bibliography", "审查引用"], true],
  ["consistency_review", ["一致性", "逻辑链", "research question", "假设是否", "consistency"], true],
  ["unsupported_claims", ["未支持", "没有证据", "证据缺口", "unsupported claim"], true],
  ["bibliographic_verification", ["核验 doi", "核验文献", "书目信息", "bibliographic", "撤稿"], true],
  ["full_text_search", ["全文", "页码", "原文", "搜索全文", "full text"], true],
  ["evidence_extraction", ["摘录", "证据", "定位", "evidence"], false],
  ["literature_search", ["检索", "搜索文献", "找论文", "学术资料", "literature", "search"], true],
  ["section_revision", ["修改章节", "补充", "修订", "改写", "diff", "第三章", "章节"], false],
  ["section_draft", ["起草章节", "生成章节", "写一节", "draft section"], false],
  ["export", ["导出", "export", "下载"], true],
  ["topic_comparison", ["比较题目", "比较研究题目", "多个主题", "选题比较", "topic comparison"], true],
  ["proposal_generation", ["开题报告", "confirmation proposal", "研究计划书"], false],
  ["job_control", ["暂停", "取消任务", "继续任务", "重试"], false],
  ["idea_assessment", ["研究想法", "可行性", "研究主题", "idea"], false],
];

function normalized(value: string) { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/\s+/g, " ").trim(); }
function has(text: string, feature: string) { return text.includes(feature.toLocaleLowerCase("zh-CN")); }
function chapterNumber(text: string) {
  const match = text.match(/(?:第\s*)?([1-9][0-9]?|[一二三四五六七八九十]{1,3})\s*章/);
  if (!match) return undefined;
  if (/^\d+$/.test(match[1])) return Number(match[1]);
  const digits: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (match[1] === "十") return 10;
  const [left, right] = match[1].split("十");
  return match[1].includes("十") ? (left ? digits[left] * 10 : 10) + (right ? digits[right] : 0) : digits[match[1]];
}

export function planAssistantIntent(content: string, context: { projectId?: string; documentId?: string; sectionId?: string } = {}): AssistantPlan {
  const text = normalized(content); const scored = features.map(([intent, terms, readOnly]) => ({ intent, readOnly, score: terms.reduce((sum, term) => sum + (has(text, term) ? (term.length > 3 ? 2 : 1) : 0), 0) }));
  const topicComparisonBoost = text.includes("比较") && (text.includes("题目") || text.includes("主题"));
  if (topicComparisonBoost) {
    const topicPlan = scored.find((item) => item.intent === "topic_comparison");
    if (topicPlan) topicPlan.score += 4;
  }
  const requestedChapter = chapterNumber(text);
  const chapterRepair = requestedChapter !== undefined && /(?:没有|缺少|补充|修复|检查).*(?:引用|参考文献|证据)|(?:引用|参考文献|证据).*(?:没有|缺少|补充|修复|检查)/.test(text);
  if (chapterRepair) {
    const revisionPlan = scored.find((item) => item.intent === "section_revision");
    if (revisionPlan) revisionPlan.score += 10;
  }
  scored.sort((left, right) => right.score - left.score);
  const winner = scored[0]?.score ? scored[0] : { intent: "qa" as const, readOnly: true, score: 1 }; const confidence = Math.min(0.99, 0.35 + winner.score / 10);
  return assistantPlanSchema.parse({ intent: winner.intent, confidence, readOnly: winner.readOnly, ...context, requestedActions: [winner.intent, ...(winner.intent === "section_revision" ? ["compile_claim_coverage", "run_citation_audit", "match_existing_evidence", "search_candidates", "await_human_verification", "build_diff", "await_approval", "reaudit"] : []), ...(winner.intent === "citation_audit" ? ["run_citation_audit"] : [])], ...(requestedChapter ? { sectionId: context.sectionId ?? `chapter-${String(requestedChapter).padStart(2, "0")}-main` } : {}) });
}

export function requestsProposalGeneration(content: string) { const text = normalized(content); const autonomous = ["全部接受", "都接受", "继续", "推进", "不要再问", "自行判断"].some((word) => text.includes(word)); const plan = planAssistantIntent(content); return (plan.intent === "proposal_generation" && ["生成", "输出", "完成", "撰写", "起草", "generate", "draft", "write"].some((word) => text.includes(word))) || autonomous; }

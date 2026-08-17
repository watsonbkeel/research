import { NextResponse } from "next/server";
import { callOpenAICompatible, ProviderCallError } from "@/lib/provider-client";
import { generationRequestSchema } from "@/lib/schemas";
import { readPrivateSettings, readWorkspace, recordGenerationAttempts } from "@/lib/storage";
import { hasCompletedRealAnalysis } from "@/lib/results";
import { getDefaultProjectId, getProject } from "@/lib/portfolio";

export const runtime = "nodejs";

const sectionNames = {
  methods: "Methodology",
  background: "Research Background",
  literature_review: "Critical Literature Review",
  theory: "Theoretical Framework",
  contribution: "Expected Contribution",
  results: "Results",
} as const;

const taskInstructions = {
  literature_search: "Develop search terms and candidate discovery strategies. Do not claim that a candidate source has been verified.",
  literature_summary: "Summarise only the supplied evidence records and clearly mark missing full-text support.",
  evidence_verification: "Assess the supplied evidence conservatively and distinguish DOI, metadata, abstract, full-text and claim-level status.",
  chinese_research_design: "Develop the research design in Chinese while preserving the selected project's registered design and integrity policy.",
  english_academic_writing: "Write formal academic English suitable for an Australian business-school PhD confirmation proposal.",
  citation_validation: "Check whether claims and registered source IDs correspond; do not invent citations.",
  translation: "Translate faithfully and keep construct terminology consistent.",
  formatting: "Restructure and format the supplied material without adding substantive claims.",
} as const;

const providerErrorMessages = {
  missing_api_key: "符合路由条件的模型均未配置可用API Key。请直接保存密钥，或设置配置中引用的环境变量。",
  authentication: "模型认证失败，且可用备用模型均未成功。",
  permission: "模型权限不足，且可用备用模型均未成功。",
  rate_limit: "模型服务限流，且可用备用模型均未成功。",
  invalid_request: "模型路由或请求配置无效。",
  not_found: "模型端点或模型名称不存在。",
  timeout: "模型请求超时，且可用备用模型均未成功。",
  network: "无法连接模型服务，且可用备用模型均未成功。",
  provider_unavailable: "模型服务暂时不可用，且可用备用模型均未成功。",
  invalid_response: "模型没有返回可用正文。",
  unknown: "所有可用模型均调用失败。",
} as const;

function makePrompt(
  input: { section?: keyof typeof sectionNames; prompt?: string; context: Record<string, unknown>; taskType: keyof typeof taskInstructions },
  workspace: Awaited<ReturnType<typeof readWorkspace>>,
  evidence: typeof workspace.works,
  policy: { outcomeInterpretation: string; forbiddenClaims: string[] },
) {
  const evidenceBlock = evidence
    .map((work) => `[${work.id}] ${work.authors} (${work.year}). ${work.title}. ${work.venue}. DOI: ${work.doi ?? "none"}`)
    .join("\n");
  const designBlock = workspace.experiments
    .map((study) => `${study.name}\nDesign: ${study.design}\nObjective: ${study.objective}\nConditions: ${study.conditions.join("; ")}\nPrimary test: ${study.primaryTest}\nEthics: ${study.ethics}`)
    .join("\n\n");
  const requestedWork = input.section
    ? `Write the ${sectionNames[input.section]} section.`
    : input.prompt ?? "Complete the requested research task.";
  const context = Object.keys(input.context).length > 0
    ? JSON.stringify(input.context).slice(0, 20_000)
    : "No additional context supplied.";

  return `${taskInstructions[input.taskType]}\n\nRequested work:\n${requestedWork}\n\nResearch title: ${workspace.project.titleEn}\nRegistered outcome interpretation: ${policy.outcomeInterpretation}\n\nRegistered research design:\n${designBlock || "No study design has been registered yet."}\n\nAllowed evidence:\n${evidenceBlock || "No external evidence is available. Methods may rely on the registered research design only."}\n\nAdditional user context (unverified unless supported above):\n${context}\n\nRules:\n- Do not invent facts, authors, results, scales, sample sizes, DOI values, or references.\n- Cite external claims only with an allowed source ID in square brackets.\n- Describe unverified choices as planned or proposed.\n- Respect project-specific forbidden claims: ${policy.forbiddenClaims.join("; ")}.\n- Return only the requested content.`;
}

export async function POST(request: Request) {
  const parsed = generationRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "生成请求无效。" }, { status: 400 });
  }

  const projectId = parsed.data.projectId ?? getDefaultProjectId();
  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const [workspace, settings] = await Promise.all([readWorkspace(projectId), readPrivateSettings()]);
  if (parsed.data.section === "results" && !hasCompletedRealAnalysis(undefined, projectId)) {
    return NextResponse.json({ error: "Results章节已阻断：尚无完成且标记为真实数据的AnalysisRun。请先登记可复现的真实分析运行。" }, { status: 409 });
  }
  const evidence = workspace.works.filter((work) => ["全文已阅读", "论断证据已定位"].includes(work.status));
  const requiresEvidence = parsed.data.section
    ? parsed.data.section !== "methods"
    : ["literature_summary", "evidence_verification", "english_academic_writing", "citation_validation"]
      .includes(parsed.data.taskType);
  if (requiresEvidence && evidence.length === 0) {
    return NextResponse.json({ error: "该任务需要全文或论断级证据；当前证据库尚未达到生成门槛。" }, { status: 409 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const result = await callOpenAICompatible({
      settings,
      taskType: parsed.data.taskType,
      explicitProfileId: parsed.data.profileId,
      prompt: makePrompt(parsed.data, workspace, evidence, project.policy),
      systemPrompt: "You are a cautious doctoral research assistant. Follow the evidence and research-integrity rules exactly.",
      temperature: 0.2,
      signal: controller.signal,
    });
    await recordGenerationAttempts(parsed.data.taskType, result.attempts);

    const draft = result.content.trim();
    const allowedIds = new Set(evidence.map((work) => work.id));
    const citedIds = Array.from(draft.matchAll(/\[([A-Za-z0-9_-]+)\]/g), (match) => match[1]);
    const unknown = citedIds.filter((id) => !allowedIds.has(id));
    if (unknown.length > 0) {
      return NextResponse.json({ error: `模型使用了证据库之外的引用：${Array.from(new Set(unknown)).join(", ")}` }, { status: 422 });
    }

    return NextResponse.json({
      section: parsed.data.section,
      taskType: parsed.data.taskType,
      draft,
      citationIds: Array.from(new Set(citedIds)),
      evidenceLevel: parsed.data.section === "methods" ? "research-design" : "full-text-gated",
      usedProfile: {
        id: result.profile.id,
        name: result.profile.name,
        provider: result.profile.provider,
        model: result.profile.model,
      },
      attempts: result.attempts,
      fallbackUsed: result.attempts.length > 1,
    });
  } catch (error) {
    if (error instanceof ProviderCallError) {
      await recordGenerationAttempts(parsed.data.taskType, error.attempts);
      return NextResponse.json(
        { error: providerErrorMessages[error.category], category: error.category, attempts: error.attempts },
        { status: error.category === "missing_api_key" || error.category === "invalid_request" ? 400 : 502 },
      );
    }
    return NextResponse.json({ error: "模型调用失败。" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}

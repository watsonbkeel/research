import { NextResponse } from "next/server";
import { classifyProviderError } from "@/lib/provider-client";
import { connectionTestSchema } from "@/lib/schemas";
import { resolveEnvironmentSecret } from "@/lib/secret-resolver";
import { readPrivateSettings } from "@/lib/storage";

export const runtime = "nodejs";

const errorMessages = {
  authentication: "认证失败，请检查该模型保存的API Key或对应环境变量。",
  permission: "API Key没有访问该端点或模型的权限。",
  not_found: "服务端点不提供模型列表接口，请核对Base URL。",
  rate_limit: "服务商限流，请稍后重试。",
  timeout: "连接超时。",
  network: "无法连接模型服务。",
  provider_unavailable: "模型服务暂时不可用。",
  invalid_request: "模型配置无效。",
  invalid_response: "模型服务返回了无效响应。",
  missing_api_key: "未配置该模型的直接API Key，且对应环境变量不存在。",
  unknown: "连接测试失败。",
} as const;

export async function POST(request: Request) {
  const parsed = connectionTestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, category: "invalid_request", error: "请选择要测试的模型配置。" }, { status: 400 });
  const settings = await readPrivateSettings();
  const profile = settings.profiles.find((candidate) => candidate.id === parsed.data.profileId);
  if (!profile) return NextResponse.json({ ok: false, category: "invalid_request", error: "模型配置不存在。" }, { status: 404 });
  const apiKey = resolveEnvironmentSecret(profile.apiKeyRef);
  if (!apiKey) return NextResponse.json({ ok: false, category: "missing_api_key", error: errorMessages.missing_api_key }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${profile.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      const category = classifyProviderError(response.status);
      return NextResponse.json({ ok: false, category, httpStatus: response.status, error: errorMessages[category] }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      message: "端点连接成功，密钥未发送到浏览器。",
      profile: { id: profile.id, name: profile.name, provider: profile.provider, model: profile.model },
    });
  } catch (error) {
    const category = classifyProviderError(error);
    return NextResponse.json(
      { ok: false, category, error: errorMessages[category] },
      { status: 502 },
    );
  } finally {
    clearTimeout(timeout);
  }
}

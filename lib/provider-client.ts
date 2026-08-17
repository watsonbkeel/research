import { getRouteCandidates } from "./model-routing";
import { resolveEnvironmentSecret, type SecretResolver } from "./secret-resolver";
import type { ModelProfile, ModelSettings, TaskType } from "./types";

export type ProviderErrorCategory =
  | "missing_api_key"
  | "authentication"
  | "permission"
  | "rate_limit"
  | "invalid_request"
  | "not_found"
  | "timeout"
  | "network"
  | "provider_unavailable"
  | "invalid_response"
  | "unknown";

export interface SanitizedProviderAttempt {
  profileId: string;
  profileName: string;
  provider: string;
  model: string;
  status: "succeeded" | "failed";
  errorCategory?: ProviderErrorCategory;
  httpStatus?: number;
  elapsedMs: number;
}

export interface UsedProfileMetadata {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  priority: number;
}

export interface ProviderCallResult {
  content: string;
  profile: UsedProfileMetadata;
  attempts: SanitizedProviderAttempt[];
}

export interface ProviderCallRequest {
  settings: ModelSettings;
  taskType: TaskType;
  prompt: string;
  explicitProfileId?: string;
  systemPrompt?: string;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ProviderCallOptions {
  fetchImpl?: typeof fetch;
  secretResolver?: SecretResolver;
  now?: () => number;
}

function statusFrom(input: unknown): number | undefined {
  if (typeof input === "number") return input;
  if (input && typeof input === "object" && "status" in input && typeof input.status === "number") return input.status;
  return undefined;
}

export function classifyProviderError(input: unknown): ProviderErrorCategory {
  const status = statusFrom(input);
  if (status === 400 || status === 409 || status === 422) return "invalid_request";
  if (status === 401) return "authentication";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status !== undefined && status >= 500) return "provider_unavailable";

  if (input instanceof DOMException && input.name === "AbortError") return "timeout";
  if (input instanceof TypeError) return "network";
  if (input instanceof Error) {
    const message = input.message.toLowerCase();
    if (message.includes("abort") || message.includes("timeout")) return "timeout";
    if (message.includes("network") || message.includes("fetch") || message.includes("socket") || message.includes("dns")) return "network";
  }
  return "unknown";
}

function publicProfile(profile: ModelProfile): UsedProfileMetadata {
  return {
    id: profile.id,
    name: profile.name,
    provider: profile.provider,
    baseUrl: profile.baseUrl,
    model: profile.model,
    priority: profile.priority,
  };
}

function chatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function extractContent(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) return undefined;
  const content = payload.choices[0]?.message?.content;
  if (typeof content === "string" && content.length > 0) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => part && typeof part === "object" && "text" in part && typeof part.text === "string" ? part.text : "")
      .join("");
    return text.length > 0 ? text : undefined;
  }
  return undefined;
}

export class ProviderCallError extends Error {
  readonly attempts: SanitizedProviderAttempt[];
  readonly category: ProviderErrorCategory;

  constructor(message: string, category: ProviderErrorCategory, attempts: SanitizedProviderAttempt[]) {
    super(message);
    this.name = "ProviderCallError";
    this.category = category;
    this.attempts = attempts;
  }
}

/**
 * Server-only OpenAI-compatible chat call with route fallback. The function
 * deliberately excludes prompts, response bodies, key refs and keys from
 * returned attempt metadata and thrown errors.
 */
export async function callOpenAICompatible(
  request: ProviderCallRequest,
  options: ProviderCallOptions = {},
): Promise<ProviderCallResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const secretResolver = options.secretResolver ?? resolveEnvironmentSecret;
  const now = options.now ?? Date.now;
  const profiles = getRouteCandidates(request.settings, request.taskType, request.explicitProfileId);

  if (profiles.length === 0) {
    throw new ProviderCallError("No enabled model profile is configured for this task.", "invalid_request", []);
  }

  const attempts: SanitizedProviderAttempt[] = [];

  for (const profile of profiles) {
    const startedAt = now();
    const apiKey = secretResolver(profile.apiKeyRef);
    if (!apiKey) {
      attempts.push({
        profileId: profile.id,
        profileName: profile.name,
        provider: profile.provider,
        model: profile.model,
        status: "failed",
        errorCategory: "missing_api_key",
        elapsedMs: Math.max(0, now() - startedAt),
      });
      continue;
    }

    try {
      const response = await fetchImpl(chatCompletionsUrl(profile.baseUrl), {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: profile.model,
          temperature: request.temperature ?? 0.2,
          messages: [
            ...(request.systemPrompt ? [{ role: "system", content: request.systemPrompt }] : []),
            { role: "user", content: request.prompt },
          ],
        }),
        signal: request.signal,
      });

      if (!response.ok) {
        attempts.push({
          profileId: profile.id,
          profileName: profile.name,
          provider: profile.provider,
          model: profile.model,
          status: "failed",
          errorCategory: classifyProviderError(response.status),
          httpStatus: response.status,
          elapsedMs: Math.max(0, now() - startedAt),
        });
        continue;
      }

      const payload: unknown = await response.json();
      const content = extractContent(payload);
      if (!content) {
        attempts.push({
          profileId: profile.id,
          profileName: profile.name,
          provider: profile.provider,
          model: profile.model,
          status: "failed",
          errorCategory: "invalid_response",
          httpStatus: response.status,
          elapsedMs: Math.max(0, now() - startedAt),
        });
        continue;
      }

      attempts.push({
        profileId: profile.id,
        profileName: profile.name,
        provider: profile.provider,
        model: profile.model,
        status: "succeeded",
        httpStatus: response.status,
        elapsedMs: Math.max(0, now() - startedAt),
      });
      return { content, profile: publicProfile(profile), attempts };
    } catch (error) {
      attempts.push({
        profileId: profile.id,
        profileName: profile.name,
        provider: profile.provider,
        model: profile.model,
        status: "failed",
        errorCategory: classifyProviderError(error),
        elapsedMs: Math.max(0, now() - startedAt),
      });
    }
  }

  const missingOnly = attempts.every((attempt) => attempt.errorCategory === "missing_api_key");
  const category = missingOnly ? "missing_api_key" : attempts.at(-1)?.errorCategory ?? "unknown";
  const message = missingOnly
    ? "No API key is configured for the eligible model profiles. Set the environment variables referenced by apiKeyRef."
    : "All eligible model profiles failed. Inspect the sanitized attempt metadata for status categories.";
  throw new ProviderCallError(message, category, attempts);
}

export const callProvider = callOpenAICompatible;

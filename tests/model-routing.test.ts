import { describe, expect, it, vi } from "vitest";
import { createDefaultModelSettings, getRouteCandidates, publicizeModelSettings, validateModelSettings } from "@/lib/model-routing";
import { callOpenAICompatible, ProviderCallError } from "@/lib/provider-client";
import { resolveEnvironmentSecret } from "@/lib/secret-resolver";
import type { ModelSettings } from "@/lib/types";

const settings: ModelSettings = {
  allowFullText: false,
  profiles: [
    { id: "primary", name: "Primary", provider: "Provider A", baseUrl: "https://a.example/v1", model: "model-a", apiKeyRef: "MODEL_A_KEY", enabled: true, priority: 20, notes: "" },
    { id: "fallback", name: "Fallback", provider: "Provider B", baseUrl: "https://b.example/v1", model: "model-b", apiKeyRef: "MODEL_B_KEY", enabled: true, priority: 10, notes: "" },
    { id: "disabled", name: "Disabled", provider: "Provider C", baseUrl: "https://c.example/v1", model: "model-c", apiKeyRef: "MODEL_C_KEY", enabled: false, priority: 1, notes: "" },
  ],
  routes: [{ taskType: "english_academic_writing", defaultProfileId: "primary", fallbackProfileIds: ["disabled", "fallback", "primary"] }],
};

describe("model routing", () => {
  it("creates a complete legacy-compatible default route set", () => {
    const defaults = createDefaultModelSettings({ LLM_BASE_URL: "https://gateway.example/v1", LLM_MODEL: "writer" });
    expect(defaults.profiles).toHaveLength(1);
    expect(defaults.routes).toHaveLength(8);
    expect(defaults.profiles[0].apiKeyRef).toBe("LLM_API_KEY");
    expect(validateModelSettings(defaults)).toBe(true);
  });

  it("keeps the default first, excludes disabled profiles, and de-duplicates fallbacks", () => {
    expect(getRouteCandidates(settings, "english_academic_writing").map((profile) => profile.id)).toEqual(["primary", "fallback"]);
  });

  it("puts an explicit enabled override first and retains route fallbacks", () => {
    expect(getRouteCandidates(settings, "english_academic_writing", "fallback").map((profile) => profile.id)).toEqual(["fallback", "primary"]);
    expect(getRouteCandidates(settings, "english_academic_writing", "disabled").map((profile) => profile.id)).toEqual(["primary", "fallback"]);
  });

  it("publicizes key status without exposing a secret", () => {
    const publicSettings = publicizeModelSettings(settings, (ref) => ref === "MODEL_A_KEY");
    const serialized = JSON.stringify(publicSettings);
    expect(publicSettings.profiles[0].hasApiKey).toBe(true);
    expect(publicSettings.profiles[1].hasApiKey).toBe(false);
    expect(serialized).not.toContain("actual-secret");
    expect(serialized).not.toContain("authorization");
  });

  it("resolves only environment-variable references", () => {
    expect(resolveEnvironmentSecret("MODEL_A_KEY", { MODEL_A_KEY: "actual-secret" })).toBe("actual-secret");
    expect(resolveEnvironmentSecret("not a ref", { "not a ref": "actual-secret" })).toBeUndefined();
  });
});

describe("provider client", () => {
  it("falls back after a provider failure and returns sanitized attempts", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response("unauthorized detail", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "result" } }] }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await callOpenAICompatible(
      { settings, taskType: "english_academic_writing", prompt: "sensitive prompt" },
      { fetchImpl, secretResolver: () => "actual-secret", now: () => 10 },
    );

    expect(result.content).toBe("result");
    expect(result.profile.id).toBe("fallback");
    expect(result.attempts.map((attempt) => attempt.errorCategory)).toEqual(["authentication", undefined]);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("actual-secret");
    expect(serialized).not.toContain("sensitive prompt");
    expect(serialized).not.toContain("MODEL_A_KEY");
  });

  it("reports an actionable missing-key error without leaking key refs or prompts", async () => {
    await expect(callOpenAICompatible(
      { settings, taskType: "english_academic_writing", prompt: "sensitive prompt" },
      { secretResolver: () => undefined },
    )).rejects.toMatchObject({ category: "missing_api_key" });

    try {
      await callOpenAICompatible(
        { settings, taskType: "english_academic_writing", prompt: "sensitive prompt" },
        { secretResolver: () => undefined },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderCallError);
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("sensitive prompt");
      expect(serialized).not.toContain("MODEL_A_KEY");
    }
  });
});

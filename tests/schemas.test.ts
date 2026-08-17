import { describe, expect, it } from "vitest";
import { generationRequestSchema, localSecretUpdateSchema, modelSettingsSchema, workImportSchema } from "@/lib/schemas";

describe("settings validation", () => {
  const profile = {
    id: "research",
    name: "Research model",
    provider: "OpenAI-compatible",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-test",
    apiKeyRef: "MODEL_RESEARCH_KEY",
    enabled: true,
    priority: 10,
    notes: "",
  };

  it("accepts multiple HTTPS and localhost model profiles", () => {
    expect(modelSettingsSchema.safeParse({
      profiles: [profile, { ...profile, id: "local", baseUrl: "http://localhost:11434/v1", model: "local" }],
      routes: [{ taskType: "english_academic_writing", defaultProfileId: "research", fallbackProfileIds: ["local"] }],
      allowFullText: false,
    }).success).toBe(true);
  });

  it("rejects insecure remote endpoints", () => {
    expect(modelSettingsSchema.safeParse({ profiles: [{ ...profile, baseUrl: "http://example.com/v1" }], routes: [], allowFullText: false }).success).toBe(false);
  });

  it("rejects a plaintext API key field", () => {
    const parsed = modelSettingsSchema.safeParse({ ...profile, apiKey: "actual-secret" });
    expect(parsed.success).toBe(false);
  });

  it("preserves case and symbols in the dedicated local secret input", () => {
    const apiKey = "sk-Test-a_b.C9+/=";
    const parsed = localSecretUpdateSchema.parse({ profileId: "research", apiKey });
    expect(parsed.apiKey).toBe(apiKey);
  });

  it("accepts normalized literature candidates and rejects incomplete records", () => {
    expect(workImportSchema.safeParse({ title: "A valid research title", authors: "Author, A.", year: 2025, venue: "Journal", doi: "10.1000/example" }).success).toBe(true);
    expect(workImportSchema.safeParse({ title: "X", year: 2025 }).success).toBe(false);
  });

  it("allows only supported evidence-gated proposal sections", () => {
    expect(generationRequestSchema.safeParse({ section: "methods" }).success).toBe(true);
    expect(generationRequestSchema.safeParse({ taskType: "translation", prompt: "Translate this" }).success).toBe(true);
    expect(generationRequestSchema.safeParse({ section: "full_thesis" }).success).toBe(false);
  });
});

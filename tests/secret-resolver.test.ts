import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteLocalSecret, hasEnvironmentSecret, resolveEnvironmentSecret, saveLocalSecret } from "@/lib/secret-resolver";

const originalSecretFile = process.env.WORKBENCH_SECRET_FILE;
let temporaryDirectory: string | undefined;

afterEach(() => {
  if (originalSecretFile === undefined) delete process.env.WORKBENCH_SECRET_FILE;
  else process.env.WORKBENCH_SECRET_FILE = originalSecretFile;
  if (temporaryDirectory) rmSync(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

describe("restricted local secret storage", () => {
  it("preserves API key case, hyphens and symbols without returning it as metadata", () => {
    temporaryDirectory = mkdtempSync(path.join(tmpdir(), "proposal-secrets-"));
    const secretFile = path.join(temporaryDirectory, "model-secrets.json");
    process.env.WORKBENCH_SECRET_FILE = secretFile;
    const apiKey = "sk-Test-a_b.C9+/=";

    saveLocalSecret("MODEL_WRITER_KEY", apiKey);
    expect(resolveEnvironmentSecret("MODEL_WRITER_KEY", {})).toBe(apiKey);
    expect(hasEnvironmentSecret("MODEL_WRITER_KEY", {})).toBe(true);
    expect(statSync(secretFile).mode & 0o777).toBe(0o600);

    deleteLocalSecret("MODEL_WRITER_KEY");
    expect(resolveEnvironmentSecret("MODEL_WRITER_KEY", {})).toBeUndefined();
  });
});

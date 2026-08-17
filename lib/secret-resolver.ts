import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export type SecretResolver = (apiKeyRef: string) => string | undefined;

const ENVIRONMENT_VARIABLE = /^[A-Z][A-Z0-9_]*$/;

function secretStorePath() {
  if (process.env.WORKBENCH_SECRET_FILE) return process.env.WORKBENCH_SECRET_FILE;
  const localDirectory = process.env.WORKBENCH_DATA_DIR ?? path.join(process.cwd(), ".local");
  return path.join(localDirectory, "model-secrets.json");
}

function readLocalSecrets(): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(secretStorePath(), "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(
      (entry): entry is [string, string] => ENVIRONMENT_VARIABLE.test(entry[0]) && typeof entry[1] === "string",
    ));
  } catch {
    return {};
  }
}

function writeLocalSecrets(secrets: Record<string, string>) {
  const destination = secretStorePath();
  const directory = path.dirname(destination);
  const temporary = `${destination}.${process.pid}.tmp`;
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  writeFileSync(temporary, `${JSON.stringify(secrets, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, destination);
  chmodSync(destination, 0o600);
}

/** Server-side resolver. Environment variables override the restricted local store. */
export function resolveEnvironmentSecret(
  apiKeyRef: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  if (!ENVIRONMENT_VARIABLE.test(apiKeyRef)) return undefined;
  const value = env[apiKeyRef];
  if (value && value.trim().length > 0) return value;
  const localValue = readLocalSecrets()[apiKeyRef];
  return localValue && localValue.length > 0 ? localValue : undefined;
}

export function hasEnvironmentSecret(
  apiKeyRef: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return Boolean(resolveEnvironmentSecret(apiKeyRef, env));
}

export function createEnvironmentSecretResolver(
  env: Readonly<Record<string, string | undefined>> = process.env,
): SecretResolver {
  return (apiKeyRef) => resolveEnvironmentSecret(apiKeyRef, env);
}

export function saveLocalSecret(apiKeyRef: string, secret: string) {
  if (!ENVIRONMENT_VARIABLE.test(apiKeyRef)) throw new Error("无效的密钥引用名。");
  if (secret.length === 0 || secret.length > 2000 || /[\r\n]/.test(secret)) throw new Error("API Key格式无效。");
  writeLocalSecrets({ ...readLocalSecrets(), [apiKeyRef]: secret });
}

export function deleteLocalSecret(apiKeyRef: string) {
  if (!ENVIRONMENT_VARIABLE.test(apiKeyRef)) return;
  const secrets = readLocalSecrets();
  if (!(apiKeyRef in secrets)) return;
  delete secrets[apiKeyRef];
  writeLocalSecrets(secrets);
}

import { modelProfileSchema, modelSettingsSchema, taskRouteSchema, taskTypes } from "./schemas";
import type {
  ModelProfile,
  ModelSettings,
  PublicModelSettings,
  TaskRoute,
  TaskType,
} from "./types";

export const TASK_TYPES = taskTypes;

export type HasKeyResolver = (apiKeyRef: string) => boolean;

export function createDefaultModelSettings(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ModelSettings {
  const defaultProfile: ModelProfile = {
    id: "default-openai-compatible",
    name: "Default OpenAI-compatible model",
    provider: "OpenAI-compatible",
    baseUrl: env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: env.LLM_MODEL ?? "gpt-5-mini",
    apiKeyRef: "LLM_API_KEY",
    enabled: true,
    priority: 100,
    notes: "Legacy-compatible default profile. The key is resolved from LLM_API_KEY on the server.",
  };

  return {
    profiles: [defaultProfile],
    routes: TASK_TYPES.map((taskType) => ({
      taskType,
      defaultProfileId: defaultProfile.id,
      fallbackProfileIds: [],
    })),
    allowFullText: false,
  };
}

export function publicizeModelSettings(
  settings: ModelSettings,
  hasKeyResolver: HasKeyResolver,
): PublicModelSettings {
  return {
    profiles: settings.profiles.map((profile) => ({
      ...profile,
      hasApiKey: hasKeyResolver(profile.apiKeyRef),
    })),
    routes: settings.routes.map((route) => ({ ...route, fallbackProfileIds: [...route.fallbackProfileIds] })),
    allowFullText: settings.allowFullText,
  };
}

function profilesForIds(ids: readonly string[], profilesById: ReadonlyMap<string, ModelProfile>) {
  const seen = new Set<string>();
  return ids
    .map((id, index) => ({ profile: profilesById.get(id), index }))
    .filter((entry): entry is { profile: ModelProfile; index: number } =>
      Boolean(entry.profile?.enabled) && !seen.has(entry.profile!.id) && Boolean(seen.add(entry.profile!.id)),
    )
    .sort((left, right) => left.profile.priority - right.profile.priority || left.index - right.index)
    .map((entry) => entry.profile);
}

/**
 * Returns eligible profiles in call order. An enabled explicit profile always
 * comes first. Otherwise the route default comes first, followed by enabled,
 * de-duplicated fallbacks ordered by profile priority (lower is earlier).
 */
export function getRouteCandidates(
  settings: ModelSettings,
  taskType: TaskType,
  explicitProfileId?: string,
): ModelProfile[] {
  const enabledProfiles = settings.profiles.filter((profile) => profile.enabled);
  const profilesById = new Map(enabledProfiles.map((profile) => [profile.id, profile]));
  const route = settings.routes.find((candidate) => candidate.taskType === taskType);
  const result: ModelProfile[] = [];
  const seen = new Set<string>();

  const append = (profile: ModelProfile | undefined) => {
    if (profile && !seen.has(profile.id)) {
      seen.add(profile.id);
      result.push(profile);
    }
  };

  append(explicitProfileId ? profilesById.get(explicitProfileId) : undefined);

  if (route) {
    append(route.defaultProfileId ? profilesById.get(route.defaultProfileId) : undefined);
    profilesForIds(route.fallbackProfileIds, profilesById).forEach(append);
  } else {
    [...enabledProfiles]
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
      .forEach(append);
  }

  return result;
}

export const isTaskType = (input: unknown): input is TaskType => taskTypes.includes(input as TaskType);
export const validateModelProfile = (input: unknown): input is ModelProfile => modelProfileSchema.safeParse(input).success;
export const validateTaskRoute = (input: unknown): input is TaskRoute => taskRouteSchema.safeParse(input).success;
export const validateModelSettings = (input: unknown): input is ModelSettings => modelSettingsSchema.safeParse(input).success;

export const parseModelProfile = (input: unknown): ModelProfile => modelProfileSchema.parse(input);
export const parseTaskRoute = (input: unknown): TaskRoute => taskRouteSchema.parse(input);
export const parseModelSettings = (input: unknown): ModelSettings => modelSettingsSchema.parse(input);

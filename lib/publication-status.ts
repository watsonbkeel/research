import { createHash } from "node:crypto";
import { savePublicationStatusCheck } from "./evidence-store";
import type { PublicationStatus, PublicationStatusCheckResult } from "./types";

export interface PublicationStatusAdapter {
  name: string;
  check(input: { doi?: string; title?: string; authors?: string[] }): Promise<Omit<PublicationStatusCheckResult, "id" | "projectId" | "workId">>;
}

function normalizeRelation(value: string) { return value.toLowerCase().replace(/[_-]+/g, " "); }

export function statusFromCrossrefMessage(message: Record<string, unknown>): { status: PublicationStatus; relatedItems: PublicationStatusCheckResult["relatedItems"] } {
  const relatedItems: PublicationStatusCheckResult["relatedItems"] = [];
  const relations = (message.relation && typeof message.relation === "object" ? message.relation : {}) as Record<string, unknown>;
  const updates = Array.isArray(message["update-to"]) ? message["update-to"] : [];
  for (const [relationType, entries] of Object.entries(relations)) {
    for (const entry of Array.isArray(entries) ? entries : [entries]) if (entry && typeof entry === "object") relatedItems.push({ relationType, doi: typeof (entry as Record<string, unknown>).id === "string" ? String((entry as Record<string, unknown>).id) : undefined, title: typeof (entry as Record<string, unknown>).title === "string" ? String((entry as Record<string, unknown>).title) : undefined });
  }
  for (const entry of updates) if (entry && typeof entry === "object") relatedItems.push({ relationType: String((entry as Record<string, unknown>).type ?? "update"), doi: typeof (entry as Record<string, unknown>).DOI === "string" ? String((entry as Record<string, unknown>).DOI) : undefined, title: typeof (entry as Record<string, unknown>).label === "string" ? String((entry as Record<string, unknown>).label) : undefined, publishedAt: typeof (entry as Record<string, unknown>).updated === "string" ? String((entry as Record<string, unknown>).updated) : undefined });
  const relationText = relatedItems.map((item) => normalizeRelation(`${item.relationType} ${item.title ?? ""}`)).join(" ");
  const subtype = normalizeRelation(String(message.subtype ?? message.type ?? ""));
  if (/expression of concern/.test(`${subtype} ${relationText}`)) return { status: "expression_of_concern", relatedItems };
  if (/retract/.test(`${subtype} ${relationText}`)) return { status: "retracted", relatedItems };
  if (/correct|corrig|errat/.test(`${subtype} ${relationText}`)) return { status: "corrected", relatedItems };
  return { status: "unknown", relatedItems };
}

export class CrossrefPublicationStatusAdapter implements PublicationStatusAdapter {
  readonly name = "crossref";
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  async check(input: { doi?: string; title?: string; authors?: string[] }) {
    const checkedAt = new Date().toISOString();
    if (!input.doi) return { checkState: "failed" as const, status: "unknown" as const, checkedAt, provider: this.name, relatedItems: [], notes: "Crossref publication-status check requires a DOI." };
    try {
      const response = await this.fetchImpl(`https://api.crossref.org/works/${encodeURIComponent(input.doi)}`, { headers: { "user-agent": "doctoral-evidence-workbench/2.0" } });
      if (!response.ok) return { checkState: "failed" as const, status: "unknown" as const, checkedAt, provider: this.name, relatedItems: [], notes: `Crossref returned ${response.status}.` };
      const payload = await response.json() as { message?: Record<string, unknown> };
      const parsed = statusFromCrossrefMessage(payload.message ?? {});
      return { checkState: "checked" as const, status: parsed.status, checkedAt, provider: this.name, relatedItems: parsed.relatedItems, rawResponseHash: createHash("sha256").update(JSON.stringify(payload)).digest("hex"), notes: parsed.status === "unknown" ? "The provider returned metadata but did not establish a clear publication status; manual confirmation is required." : undefined };
    } catch (error) {
      return { checkState: "failed" as const, status: "unknown" as const, checkedAt, provider: this.name, relatedItems: [], notes: error instanceof Error ? error.message : "Publication status provider failed." };
    }
  }
}

export async function checkPublicationStatus(input: { projectId: string; workId: string; doi?: string; title?: string; authors?: string[]; adapter?: PublicationStatusAdapter }) {
  const adapter = input.adapter ?? new CrossrefPublicationStatusAdapter();
  const result = await adapter.check({ doi: input.doi, title: input.title, authors: input.authors });
  return savePublicationStatusCheck({ ...result, projectId: input.projectId, workId: input.workId });
}

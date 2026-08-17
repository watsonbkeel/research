/* eslint-disable @typescript-eslint/no-explicit-any */
/** Metadata-only discovery adapters used by the long-running research worker. */

export type SearchProvider = "openalex" | "crossref" | "semantic-scholar";

export interface CandidateRecord {
  id: string;
  provider: SearchProvider;
  sourceId: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  citations?: number;
  retrievedAt: string;
  provenance: "metadata-discovery";
}

export interface SearchFailure {
  provider: SearchProvider;
  attempts: number;
  category: "http" | "network" | "invalid-response";
  status?: number;
  message: string;
  retryable: boolean;
}

export interface SearchResult {
  query: string;
  candidates: CandidateRecord[];
  failures: SearchFailure[];
  providers: SearchProvider[];
}

export interface SearchOptions {
  fetchImpl?: typeof fetch;
  providers?: SearchProvider[];
  perProvider?: number;
  retries?: number;
  now?: () => string;
  semanticScholarApiKey?: string;
  signal?: AbortSignal;
}

const endpoints: Record<SearchProvider, string> = {
  openalex: "https://api.openalex.org/works",
  crossref: "https://api.crossref.org/works",
  "semantic-scholar": "https://api.semanticscholar.org/graph/v1/paper/search",
};

function text(value: unknown): string | undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function year(value: unknown): number | undefined { return typeof value === "number" && Number.isInteger(value) ? value : undefined; }
function doiValue(value: unknown): string | undefined {
  const found = text(value)?.replace(/^https?:\/\/doi\.org\//i, "").trim().toLowerCase();
  return found || undefined;
}
function authors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((a) => typeof a === "string" ? a : typeof a === "object" && a !== null
    ? text((a as Record<string, unknown>).name) ?? text((a as Record<string, unknown>).author)?.replace(/^\s+|\s+$/g, "")
    : undefined).filter((a): a is string => Boolean(a));
}
function stableId(provider: SearchProvider, sourceId: string, title: string) {
  return `${provider}:${sourceId || title.toLowerCase().replace(/\W+/g, "-").slice(0, 120)}`;
}

function parseOpenAlex(items: unknown[], now: string): CandidateRecord[] {
  return items.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const i = raw as Record<string, unknown>; const sourceId = text(i.id); const title = text(i.display_name);
    if (!title) return [];
    const as = Array.isArray(i.authorships) ? i.authorships.map((a) => typeof a === "object" && a && typeof (a as any).author?.display_name === "string" ? (a as any).author.display_name : undefined).filter(Boolean) as string[] : [];
    const loc = i.primary_location as any;
    return [{ id: stableId("openalex", sourceId ?? "", title), provider: "openalex", sourceId: sourceId ?? title, title, authors: as, year: year(i.publication_year), venue: text(loc?.source?.display_name), doi: doiValue(i.doi), url: text(loc?.landing_page_url) ?? text(i.id), citations: year(i.cited_by_count), retrievedAt: now, provenance: "metadata-discovery" }];
  });
}
function parseCrossref(items: unknown[], now: string): CandidateRecord[] {
  return items.flatMap((raw) => { if (!raw || typeof raw !== "object") return []; const i = raw as any; const title = text(i.title?.[0]); if (!title) return []; const date = i.published?.["date-parts"]?.[0]?.[0]; return [{ id: stableId("crossref", text(i.DOI) ?? "", title), provider: "crossref", sourceId: text(i.DOI) ?? title, title, authors: Array.isArray(i.author) ? i.author.map((a: any) => [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean) : [], year: year(date), venue: text(i["container-title"]?.[0]), doi: doiValue(i.DOI), url: text(i.URL), citations: year(i["is-referenced-by-count"]), retrievedAt: now, provenance: "metadata-discovery" }]; });
}
function parseSemantic(items: unknown[], now: string): CandidateRecord[] {
  return items.flatMap((raw) => { if (!raw || typeof raw !== "object") return []; const i = raw as any; const title = text(i.title); if (!title) return []; return [{ id: stableId("semantic-scholar", text(i.paperId) ?? "", title), provider: "semantic-scholar", sourceId: text(i.paperId) ?? title, title, authors: authors(i.authors), year: year(i.year), venue: text(i.venue), doi: doiValue(i.externalIds?.DOI), url: text(i.url), abstract: text(i.abstract), citations: year(i.citationCount), retrievedAt: now, provenance: "metadata-discovery" }]; });
}

async function request(provider: SearchProvider, query: string, options: Required<Pick<SearchOptions, "fetchImpl" | "retries" | "perProvider">> & { semanticScholarApiKey?: string; signal?: AbortSignal }): Promise<{ items: unknown[] } | SearchFailure> {
  let last: SearchFailure = { provider, attempts: 0, category: "network", message: "Request failed", retryable: true };
  for (let attempt = 1; attempt <= options.retries + 1; attempt++) {
    const url = new URL(endpoints[provider]);
    if (provider === "openalex") { url.searchParams.set("search", query); url.searchParams.set("per-page", String(options.perProvider)); url.searchParams.set("select", "id,display_name,publication_year,doi,cited_by_count,authorships,primary_location"); }
    if (provider === "crossref") { url.searchParams.set("query", query); url.searchParams.set("rows", String(options.perProvider)); url.searchParams.set("select", "DOI,title,author,published,container-title,URL,is-referenced-by-count"); }
    if (provider === "semantic-scholar") { url.searchParams.set("query", query); url.searchParams.set("limit", String(options.perProvider)); url.searchParams.set("fields", "title,authors,year,venue,externalIds,url,abstract,citationCount"); }
    try {
      const headers: Record<string, string> = { "user-agent": "doctoral-workbench/0.1 (metadata discovery)" };
      if (provider === "semantic-scholar" && options.semanticScholarApiKey) headers["x-api-key"] = options.semanticScholarApiKey;
      const response = await options.fetchImpl(url, { headers, signal: options.signal });
      if (!response.ok) { last = { provider, attempts: attempt, category: "http", status: response.status, message: `HTTP ${response.status}`, retryable: response.status === 429 || response.status >= 500 }; if (!last.retryable) break; }
      else { const payload = await response.json() as any; const items = provider === "crossref" ? payload?.message?.items : payload?.data ?? payload?.results; if (!Array.isArray(items)) { last = { provider, attempts: attempt, category: "invalid-response", message: "Provider returned an invalid metadata response", retryable: false }; break; } return { items }; }
    } catch (error) { last = { provider, attempts: attempt, category: "network", message: error instanceof Error ? error.message : String(error), retryable: true }; }
    if (attempt <= options.retries) await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** (attempt - 1), 8000)));
  }
  return last;
}

export async function searchAcademicMetadata(query: string, options: SearchOptions = {}): Promise<SearchResult> {
  const normalized = query.trim(); if (!normalized) throw new Error("Search query is required");
  const providers = options.providers ?? ["openalex", "crossref", "semantic-scholar"];
  const perProvider = Math.max(1, Math.min(100, options.perProvider ?? 20)); const retries = Math.max(0, Math.min(4, options.retries ?? 2));
  const now = options.now ?? (() => new Date().toISOString()); const fetchImpl = options.fetchImpl ?? fetch;
  const results = await Promise.all(providers.map((provider) => request(provider, normalized, { fetchImpl, retries, perProvider, semanticScholarApiKey: options.semanticScholarApiKey ?? process.env.SEMANTIC_SCHOLAR_API_KEY, signal: options.signal })));
  const candidates = results.flatMap((result, index) => "items" in result ? (providers[index] === "openalex" ? parseOpenAlex(result.items, now()) : providers[index] === "crossref" ? parseCrossref(result.items, now()) : parseSemantic(result.items, now())) : []);
  const failures = results.filter((result): result is SearchFailure => !((result as any).items));
  const seen = new Set<string>(); const deduped = candidates.filter((candidate) => { const key = candidate.doi ? `doi:${candidate.doi}` : `title:${candidate.title.toLowerCase().replace(/\W+/g, " ").trim()}`; if (seen.has(key)) return false; seen.add(key); return true; });
  return { query: normalized, candidates: deduped, failures, providers: [...providers] };
}

export const searchAcademic = searchAcademicMetadata;

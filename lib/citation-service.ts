import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { Cite } from "@citation-js/core";
import * as CitationCore from "@citation-js/core";
import "@citation-js/plugin-csl";
import type { CitationCluster, CitationProcessorStyle, Work } from "./types";

export type CitationStyle = CitationProcessorStyle;
export type { CitationCluster, CitationItem } from "./types";
const GB7714_STYLE = "china-national-standard-gb-t-7714-2015-numeric";
type CslRegister = { has(name: string): boolean; add(name: string, value: string): void; get(name: string): string };
const cslConfig = (CitationCore as unknown as { plugins: { config: { get(name: string): { styles: CslRegister; locales: CslRegister } } } }).plugins.config.get("@csl");
if (!cslConfig.styles.has(GB7714_STYLE)) cslConfig.styles.add(GB7714_STYLE, readFileSync(path.join(process.cwd(), "lib/csl/china-national-standard-gb-t-7714-2015-numeric.csl"), "utf8"));
if (!cslConfig.locales.has("zh-CN")) cslConfig.locales.add("zh-CN", readFileSync(path.join(process.cwd(), "lib/csl/locales-zh-CN.xml"), "utf8"));
const require = createRequire(import.meta.url);
const Citeproc = require("citeproc") as { Engine: new (system: { retrieveLocale(locale: string): string; retrieveItem(id: string): Record<string, unknown> }, style: string, locale: string) => { updateItems(ids: string[]): void; processCitationCluster(citation: Record<string, unknown>, citationsPre: Array<[string, number]>, citationsPost: Array<[string, number]>): [unknown, Array<[number, string]>]; makeBibliography(): [{ entry_ids?: string[][] }, string[]] | false } };

function authors(work: Work): Array<{ family?: string; given?: string; literal?: string }> {
  if (work.authorsStructured?.length) return work.authorsStructured.map((author) => ({ family: author.family, given: author.given }));
  return work.authors.split(/;|\band\b/i).map((value) => value.trim()).filter(Boolean).map((value) => {
    const comma = value.indexOf(",");
    if (comma > 0) return { family: value.slice(0, comma).trim(), given: value.slice(comma + 1).trim() || undefined };
    if (/\b(?:university|organization|association|government|institute|department|committee|world bank)\b/i.test(value)) return { literal: value };
    const parts = value.split(/\s+/); return parts.length > 1 ? { family: parts.at(-1)!, given: parts.slice(0, -1).join(" ") } : { family: value };
  });
}

export function toCslJson(work: Work) {
  const author = authors(work);
  const cslTypes: Record<NonNullable<Work["sourceType"]>, string> = { "journal-article": "article-journal", book: "book", chapter: "chapter", "conference-paper": "paper-conference", thesis: "thesis", report: "report", "web-page": "webpage", dataset: "dataset" };
  return {
    id: work.id, type: work.sourceType ? cslTypes[work.sourceType] : "article-journal",
    title: work.title, author, issued: { "date-parts": [[work.year]] }, "container-title": work.containerTitle ?? work.venue,
    volume: work.volume, issue: work.issue, page: work.pages, publisher: work.publisher, DOI: work.doi, URL: work.url,
  };
}

function inlineAuthor(work: Work) {
  const list = authors(work).map((author) => author.family ?? author.literal).filter((value): value is string => Boolean(value));
  if (list.length === 0) return "Unknown author";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list[0]} et al.`;
}

function citationYearSuffixes(works: Work[], workIds: string[]) {
  const included = new Set(workIds); const groups = new Map<string, Work[]>();
  for (const work of works.filter((item) => included.has(item.id))) { const key = `${inlineAuthor(work).toLowerCase()}|${work.year}`; groups.set(key, [...(groups.get(key) ?? []), work]); }
  const suffixes = new Map<string, string>();
  for (const group of groups.values()) if (group.length > 1) group.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id)).forEach((work, index) => suffixes.set(work.id, String.fromCharCode(97 + index)));
  return suffixes;
}

export function renderCitationCluster(cluster: Pick<CitationCluster, "id" | "items">, works: Work[], style: CitationStyle = "apa") {
  const records = new Map(works.map((work) => [work.id, toCslJson(work) as Record<string, unknown>])); const locale = style === "gb7714" ? "zh-CN" : "en-US"; const template = style === "gb7714" ? GB7714_STYLE : "apa";
  for (const item of cluster.items) if (!records.has(item.workId)) throw new Error(`CitationCluster references unknown Work ${item.workId}.`);
  const engine = new Citeproc.Engine({ retrieveLocale: (requested) => cslConfig.locales.get(requested) || cslConfig.locales.get(locale) || cslConfig.locales.get("en-US"), retrieveItem: (id) => records.get(id) ?? {} }, cslConfig.styles.get(template), locale); engine.updateItems(cluster.items.map((item) => item.workId));
  const citationItems = cluster.items.map((item) => ({ id: item.workId, ...(item.locator ? { locator: item.locator, label: item.locatorType ?? "page" } : {}), ...(item.prefix ? { prefix: item.prefix } : {}), ...(item.suffix ? { suffix: item.suffix } : {}), ...(item.suppressAuthor ? { "suppress-author": true } : {}) }));
  const [, updates] = engine.processCitationCluster({ citationID: cluster.id, citationItems, properties: { noteIndex: 0 } }, [], []); return updates.at(-1)?.[1] ?? "";
}

export function renderDocumentCitationClusters(clusters: CitationCluster[], works: Work[], style: CitationStyle = "apa") {
  const ordered = [...clusters].sort((left, right) => (left.documentOrder ?? Number.MAX_SAFE_INTEGER) - (right.documentOrder ?? Number.MAX_SAFE_INTEGER) || left.position - right.position || left.id.localeCompare(right.id));
  const records = new Map(works.map((work) => [work.id, toCslJson(work) as Record<string, unknown>])); const locale = style === "gb7714" ? "zh-CN" : "en-US"; const template = style === "gb7714" ? GB7714_STYLE : "apa";
  const workIds = [...new Set(ordered.flatMap((cluster) => cluster.items.map((item) => item.workId)))];
  for (const workId of workIds) if (!records.has(workId)) throw new Error(`CitationCluster references unknown Work ${workId}.`);
  const engine = new Citeproc.Engine({ retrieveLocale: (requested) => cslConfig.locales.get(requested) || cslConfig.locales.get(locale) || cslConfig.locales.get("en-US"), retrieveItem: (id) => records.get(id) ?? {} }, cslConfig.styles.get(template), locale); engine.updateItems(workIds);
  const citations = new Map<string, string>(); const prior: Array<[string, number]> = [];
  ordered.forEach((cluster, index) => {
    const citationItems = cluster.items.map((item) => ({ id: item.workId, ...(item.locator ? { locator: item.locator, label: item.locatorType ?? "page" } : {}), ...(item.prefix ? { prefix: item.prefix } : {}), ...(item.suffix ? { suffix: item.suffix } : {}), ...(item.suppressAuthor || cluster.mode === "narrative" ? { "suppress-author": true } : {}) }));
    const [, updates] = engine.processCitationCluster({ citationID: cluster.id, citationItems, properties: { noteIndex: index + 1 } }, prior, []); const rendered = updates.find(([position]) => position === index)?.[1] ?? updates.at(-1)?.[1]; if (!rendered) throw new Error(`citeproc did not render CitationCluster ${cluster.id}.`);
    citations.set(cluster.id, rendered.replace(/<[^>]+>/g, "").trim()); prior.push([cluster.id, index + 1]);
  });
  const bibliographyResult = engine.makeBibliography(); if (!bibliographyResult) throw new Error("citeproc did not render a bibliography.");
  const [parameters, entries] = bibliographyResult; const entryIds = parameters.entry_ids ?? workIds.map((id) => [id]);
  const bibliography = entries.map((entry, index) => ({ workId: entryIds[index]?.[0] ?? workIds[index], text: String(entry).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() }));
  return { citations, bibliography };
}

export function renderReference(work: Work, style: CitationStyle = "apa", yearSuffix = "", strict = false) {
  try {
    const template = style === "gb7714" ? GB7714_STYLE : "apa";
    const record: Record<string, unknown> = toCslJson(work); if (yearSuffix) record.issued = { literal: `${work.year}${yearSuffix}` };
    const text = new Cite([record]).format("bibliography", { format: "text", template, lang: style === "gb7714" ? "zh-CN" : "en-US" });
    const normalized = String(text).replace(/\s+/g, " ").trim();
    return normalized;
  } catch (error) {
    if (strict) throw new Error(`CSL bibliography rendering failed for Work ${work.id}.`, { cause: error });
    const author = authors(work).map((item) => item.literal ?? `${item.family ?? ""}, ${item.given ?? ""}`.replace(/, $/, "")).join(", ");
    const doi = work.doi ? ` https://doi.org/${work.doi}` : work.url ? ` ${work.url}` : "";
    return `${author} (${work.year}${yearSuffix}). ${work.title}. ${work.venue}.${doi}`;
  }
}

export function parseCitationTokens(markdown: string) {
  return [...markdown.matchAll(/\[\[CITE:([^\]]+)\]\]/g)].flatMap((match) => match[1].split(";").map((id) => id.trim()).filter(Boolean));
}

export function renderCitationTokens(markdown: string, works: Work[], citationScopeIds?: string[], style: CitationStyle = "apa") {
  const byId = new Map(works.map((work) => [work.id, work])); const unknown: string[] = []; const cited = new Set<string>();
  const scope = citationScopeIds ?? parseCitationTokens(markdown); const stableNumbers = new Map([...new Set(scope)].map((id, index) => [id, index + 1]));
  const suffixes = citationYearSuffixes(works, scope);
  const rendered = markdown.replace(/\[\[CITE:([^\]]+)\]\]/g, (_token, raw: string) => {
    const ids = raw.split(";").map((id) => id.trim()).filter(Boolean); const valid: Work[] = [];
    for (const id of ids) { const work = byId.get(id); if (work) valid.push(work); else unknown.push(id); }
    valid.forEach((work) => cited.add(work.id));
    if (!valid.length) return "";
    if (style === "gb7714") {
      const processed = String(new Cite(valid.map(toCslJson)).format("citation", { format: "text", template: GB7714_STYLE, lang: "zh-CN" }));
      const numbers = valid.map((work) => stableNumbers.get(work.id) ?? [...stableNumbers.values()].length + 1);
      let index = 0; return processed.replace(/\d+/g, () => String(numbers[index++] ?? numbers.at(-1)));
    }
    const cluster = new Cite(valid.map((work) => { const record: Record<string, unknown> = toCslJson(work); const suffix = suffixes.get(work.id); if (suffix) record.issued = { literal: `${work.year}${suffix}` }; return record; })).format("citation", { format: "text", template: "apa", lang: "en-US" });
    return String(cluster).replace(/[.!?]\s*$/, "");
  });
  return { content: rendered, citedWorkIds: [...cited], unknownIds: [...new Set(unknown)], unresolvedTokens: /\[\[CITE:/.test(rendered) };
}

export function referencesFor(workspaceWorks: Work[], citedWorkIds: string[], style: CitationStyle = "apa") {
  const byId = new Map(workspaceWorks.map((work) => [work.id, work]));
  const suffixes = citationYearSuffixes(workspaceWorks, citedWorkIds);
  const works = [...new Set(citedWorkIds)].map((id) => byId.get(id)).filter((work): work is Work => Boolean(work));
  if (!works.length) return [];
  const records = works.map((work) => { const record: Record<string, unknown> = toCslJson(work); const suffix = suffixes.get(work.id); if (suffix) record.issued = { literal: `${work.year}${suffix}` }; return record; });
  const entries = new Cite(records).format("bibliography", { format: "text", template: style === "gb7714" ? GB7714_STYLE : "apa", lang: style === "gb7714" ? "zh-CN" : "en-US", asEntryArray: true }) as unknown as Array<[string, string]>;
  return entries.map(([workId, value]) => ({ workId, text: String(value).replace(/\s+/g, " ").trim() }));
}

export function assertFormalCitable(work: Work) {
  if (work.bibliographicStatus !== "verified") throw new Error(`Work ${work.id} 尚未完成书目核验。`);
  if (work.retractionStatus === "retracted") throw new Error(`Work ${work.id} 已撤稿，不能用于正式引用。`);
}

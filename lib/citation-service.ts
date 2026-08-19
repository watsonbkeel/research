import { Cite } from "@citation-js/core";
import "@citation-js/plugin-csl";
import type { Work } from "./types";

export type CitationStyle = "apa" | "gb7714";

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

export function renderInlineCitation(work: Work, yearSuffix = "") { return `(${inlineAuthor(work)}, ${work.year}${yearSuffix})`; }

export function renderGbInlineCitation(work: Work, index: number, locator?: string) { return `[${index}${locator ? `, ${locator}` : ""}]`; }

export function renderReference(work: Work, style: CitationStyle = "apa", yearSuffix = "") {
  if (style === "gb7714") return renderGbReference(work);
  try {
    const template = "apa";
    const text = new Cite([toCslJson(work)]).format("bibliography", { format: "text", template, lang: "en-US" });
    const normalized = String(text).replace(/\s+/g, " ").trim();
    return yearSuffix ? normalized.replace(`(${work.year})`, `(${work.year}${yearSuffix})`) : normalized;
  } catch {
    const author = authors(work).map((item) => item.literal ?? `${item.family ?? ""}, ${item.given ?? ""}`.replace(/, $/, "")).join(", ");
    const doi = work.doi ? ` https://doi.org/${work.doi}` : work.url ? ` ${work.url}` : "";
    return `${author} (${work.year}${yearSuffix}). ${work.title}. ${work.venue}.${doi}`;
  }
}

function renderGbReference(work: Work) {
  const author = authors(work).map((item) => item.literal ?? [item.family, item.given].filter(Boolean).join(", ")).filter(Boolean).join(", ") || "佚名";
  const type = work.sourceType === "book" ? "[M]" : work.sourceType === "chapter" ? "[M]" : work.sourceType === "thesis" ? "[D]" : work.sourceType === "report" ? "[R]" : work.sourceType === "web-page" ? "[EB/OL]" : work.sourceType === "dataset" ? "[DS]" : "[J]";
  const venue = work.containerTitle ?? work.venue;
  const journalDetail = work.sourceType === "journal-article" && venue ? `. ${venue}${work.volume ? `, ${work.volume}` : ""}${work.issue ? `(${work.issue})` : ""}${work.pages ? `: ${work.pages}` : ""}` : work.publisher ? `. ${work.publisher}` : venue ? `. ${venue}` : "";
  const doi = work.doi ? `. DOI: ${work.doi}` : work.url ? `. ${work.url}${work.accessedDate ? ` (accessed ${work.accessedDate})` : ""}` : "";
  return `${author}. ${work.title}${type}${journalDetail}, ${work.year}${doi}.`;
}

export function parseCitationTokens(markdown: string) {
  return [...markdown.matchAll(/\[\[CITE:([^\]]+)\]\]/g)].flatMap((match) => match[1].split(";").map((id) => id.trim()).filter(Boolean));
}

export function renderCitationTokens(markdown: string, works: Work[], citationScopeIds?: string[], style: CitationStyle = "apa") {
  const byId = new Map(works.map((work) => [work.id, work])); const unknown: string[] = []; const cited = new Set<string>();
  const suffixes = citationYearSuffixes(works, citationScopeIds ?? parseCitationTokens(markdown));
  const rendered = markdown.replace(/\[\[CITE:([^\]]+)\]\]/g, (_token, raw: string) => {
    const ids = raw.split(";").map((id) => id.trim()).filter(Boolean); const citations: string[] = [];
    ids.forEach((id, index) => { const work = byId.get(id); if (!work) { unknown.push(id); return; } cited.add(id); citations.push(style === "gb7714" ? renderGbInlineCitation(work, [...cited].length + index) : renderInlineCitation(work, suffixes.get(id))); });
    return citations.length ? citations.join("; ") : "";
  });
  return { content: rendered, citedWorkIds: [...cited], unknownIds: [...new Set(unknown)], unresolvedTokens: /\[\[CITE:/.test(rendered) };
}

export function referencesFor(workspaceWorks: Work[], citedWorkIds: string[], style: CitationStyle = "apa") {
  const byId = new Map(workspaceWorks.map((work) => [work.id, work]));
  const suffixes = citationYearSuffixes(workspaceWorks, citedWorkIds);
  return citedWorkIds.map((id) => byId.get(id)).filter((work): work is Work => Boolean(work)).map((work) => ({ workId: work.id, text: renderReference(work, style, suffixes.get(work.id)) }));
}

export function assertFormalCitable(work: Work) {
  if (work.bibliographicStatus !== "verified") throw new Error(`Work ${work.id} 尚未完成书目核验。`);
  if (work.retractionStatus === "retracted") throw new Error(`Work ${work.id} 已撤稿，不能用于正式引用。`);
}

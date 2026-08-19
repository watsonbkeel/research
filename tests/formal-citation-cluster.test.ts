import { describe, expect, it } from "vitest";
import * as citationService from "@/lib/citation-service";
import type { Work } from "@/lib/types";

describe("formal document CitationCluster regressions", () => {
  it("uses one document citeproc session for stable GB/T numbering", () => {
    const base: Work = { id: "work-a", authors: "Li, Ming", year: 2024, title: "Alpha", venue: "Fixture Journal", sourceType: "journal-article", group: "理论来源", status: "书目信息已核对", bibliographicStatus: "verified", relevance: "fixture" };
    const works = [base, { ...base, id: "work-b", authors: "Wang, Lin", title: "Beta" }];
    const renderDocument = (citationService as unknown as { renderDocumentCitationClusters?: (clusters: unknown[], works: Work[], style: string) => { citations: Map<string, string>; bibliography: Array<{ workId: string; text: string }> } }).renderDocumentCitationClusters;
    expect(renderDocument).toBeTypeOf("function");
    const output = renderDocument!([{ id: "cluster-a", sectionId: "s", sentenceId: "s1", position: 1, mode: "parenthetical", items: [{ id: "item-a", workId: "work-a" }] }, { id: "cluster-b", sectionId: "s", sentenceId: "s2", position: 2, mode: "parenthetical", items: [{ id: "item-b", workId: "work-b" }] }, { id: "cluster-a-again", sectionId: "s", sentenceId: "s3", position: 3, mode: "parenthetical", items: [{ id: "item-a-again", workId: "work-a" }] }], works, "gb7714");
    expect([...output.citations.values()]).toEqual(["[1]", "[2]", "[1]"]);
    expect(output.bibliography.map((item) => item.workId)).toEqual(["work-a", "work-b"]);
  });
});

import { describe, expect, it } from "vitest";
import { renderDocumentCitationClusters } from "@/lib/citation-service";
import type { CitationCluster, Work } from "@/lib/types";

const baseWork: Work = {
  id: "work-a",
  authors: "Li, Ming",
  year: 2024,
  title: "Alpha evidence",
  venue: "Fixture Journal",
  sourceType: "journal-article",
  group: "理论来源",
  status: "书目信息已核对",
  bibliographicStatus: "verified",
  retractionStatus: "clear",
  relevance: "fixture",
};

const works: Work[] = [
  baseWork,
  {
    ...baseWork,
    id: "work-b",
    authors: "Wang, Lin",
    title: "Beta evidence",
  },
];

function cluster(
  id: string,
  sectionId: string,
  documentOrder: number | undefined,
  workId: string,
  position = 10,
): CitationCluster {
  return {
    id,
    sectionId,
    sentenceId: `${sectionId}-sentence`,
    documentOrder,
    position,
    mode: "parenthetical",
    items: [{ id: `${id}-item`, workId }],
  };
}

describe("formal document CitationCluster regressions", () => {
  it("keeps GB/T numbering stable across three document chapters", () => {
    const output = renderDocumentCitationClusters(
      [
        cluster("cluster-a", "chapter-1-section", 1, "work-a"),
        cluster("cluster-b", "chapter-2-section", 2, "work-b"),
        cluster("cluster-a-again", "chapter-3-section", 3, "work-a"),
      ],
      works,
      "gb7714",
    );

    expect([...output.citations.values()]).toEqual(["[1]", "[2]", "[1]"]);
    expect(output.bibliography.map((item) => item.workId)).toEqual([
      "work-a",
      "work-b",
    ]);
  });

  it("uses documentOrder when section-relative positions collide", () => {
    const output = renderDocumentCitationClusters(
      [
        cluster("cluster-third", "chapter-3-section", 3, "work-a"),
        cluster("cluster-first", "chapter-1-section", 1, "work-a"),
        cluster("cluster-second", "chapter-2-section", 2, "work-b"),
      ],
      works,
      "gb7714",
    );

    expect([
      output.citations.get("cluster-first"),
      output.citations.get("cluster-second"),
      output.citations.get("cluster-third"),
    ]).toEqual(["[1]", "[2]", "[1]"]);
  });

  it("renders an exact page locator in APA and GB/T clusters", () => {
    const located = cluster("cluster-locator", "chapter-1-section", 1, "work-a");
    located.items[0] = {
      ...located.items[0],
      locatorType: "page",
      locator: "12",
    };

    const apa = renderDocumentCitationClusters([located], works, "apa");
    const gb = renderDocumentCitationClusters([located], works, "gb7714");

    expect(apa.citations.get(located.id)).toContain("12");
    expect(gb.citations.get(located.id)).toContain("12");
  });

  it("rejects formal clusters that have no documentOrder", () => {
    expect(() =>
      renderDocumentCitationClusters(
        [cluster("cluster-missing-order", "chapter-1-section", undefined, "work-a")],
        works,
        "gb7714",
      ),
    ).toThrow("documentOrder");
  });
});

import { describe, expect, it, vi } from "vitest";
import { searchAcademicMetadata } from "@/lib/assistant-search";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

describe("assistant academic metadata search", () => {
  it("normalizes and de-duplicates candidates across providers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input));
      if (url.hostname.includes("openalex")) return jsonResponse({ results: [{ id: "W1", display_name: "Shared paper", publication_year: 2024, doi: "https://doi.org/10.1000/ABC", cited_by_count: 3, authorships: [] }] });
      if (url.hostname.includes("crossref")) return jsonResponse({ message: { items: [{ DOI: "10.1000/abc", title: ["Shared paper"], published: { "date-parts": [[2024]] }, author: [] }] } });
      return jsonResponse({ data: [{ paperId: "S2", title: "A distinct paper", year: 2023, authors: [{ name: "A. Author" }], citationCount: 2 }] });
    });

    const result = await searchAcademicMetadata("second-hand AI sales", { fetchImpl, retries: 0, now: () => "2026-08-10T00:00:00.000Z" });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.title)).toEqual(["Shared paper", "A distinct paper"]);
    expect(result.failures).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("returns usable candidates when one provider fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.signal).toBeDefined();
      const url = new URL(String(input));
      if (url.hostname.includes("crossref")) return jsonResponse({}, 503);
      if (url.hostname.includes("openalex")) return jsonResponse({ results: [{ id: "W2", display_name: "Available metadata", publication_year: 2025, authorships: [] }] });
      return jsonResponse({ data: [] });
    });
    const controller = new AbortController();

    const result = await searchAcademicMetadata("trust cues", { fetchImpl, retries: 0, signal: controller.signal });

    expect(result.candidates).toHaveLength(1);
    expect(result.failures).toMatchObject([{ provider: "crossref", status: 503, retryable: true }]);
  });
});

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length < 3) return NextResponse.json({ error: "检索词至少需要3个字符" }, { status: 400 });
  const endpoint = new URL("https://api.openalex.org/works");
  endpoint.searchParams.set("search", query);
  endpoint.searchParams.set("per-page", "15");
  endpoint.searchParams.set("select", "id,display_name,publication_year,doi,cited_by_count,authorships,primary_location");
  try {
    const response = await fetch(endpoint, { headers: { "user-agent": "candidature-workbench/0.1" }, next: { revalidate: 3600 } });
    if (!response.ok) return NextResponse.json({ error: `OpenAlex返回 ${response.status}` }, { status: 502 });
    const payload = await response.json() as { results: Array<Record<string, unknown>> };
    const results = payload.results.map((item) => {
      const authorships = item.authorships as Array<{ author?: { display_name?: string } }> | undefined;
      const location = item.primary_location as { source?: { display_name?: string } } | undefined;
      return {
        id: item.id,
        title: item.display_name,
        year: item.publication_year,
        doi: typeof item.doi === "string" ? item.doi.replace("https://doi.org/", "") : undefined,
        citations: item.cited_by_count,
        authors: authorships?.map((entry) => entry.author?.display_name).filter(Boolean).join("; ") ?? "",
        venue: location?.source?.display_name ?? "",
        status: "仅检索结果，未核验",
      };
    });
    return NextResponse.json({ query, count: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: `无法连接OpenAlex：${(error as Error).message}` }, { status: 502 });
  }
}

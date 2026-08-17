import { NextResponse } from "next/server";
import { exportBibtex, exportMarkdown } from "@/lib/exporters";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format") ?? "markdown";
  const workspace = await readWorkspace();
  if (format === "markdown") {
    return new NextResponse(exportMarkdown(workspace), {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": "attachment; filename=proposal-research-pack.md" },
    });
  }
  if (format === "bibtex") {
    return new NextResponse(exportBibtex(workspace), {
      headers: { "content-type": "application/x-bibtex; charset=utf-8", "content-disposition": "attachment; filename=proposal-references.bib" },
    });
  }
  return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
}

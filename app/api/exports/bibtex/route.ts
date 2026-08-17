import { exportBibtex } from "@/lib/exporters";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const body = exportBibtex(await readWorkspace());
  return new Response(body, {
    headers: {
      "content-type": "application/x-bibtex; charset=utf-8",
      "content-disposition": 'attachment; filename="ai-c2c-references.bib"',
    },
  });
}

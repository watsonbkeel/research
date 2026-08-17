import { exportMarkdown } from "@/lib/exporters";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const body = exportMarkdown(await readWorkspace());
  return new Response(body, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "content-disposition": 'attachment; filename="ai-c2c-proposal.md"',
    },
  });
}

import { exportDocx } from "@/lib/docx-exporter";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const body = await exportDocx(await readWorkspace());
  return new Response(new Uint8Array(body), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "content-disposition": 'attachment; filename="ai-c2c-doctoral-proposal.docx"',
      "cache-control": "no-store",
    },
  });
}

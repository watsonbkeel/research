import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/storage";
import { latestPublicationStatusCheck } from "@/lib/evidence-store";
import { checkPublicationStatus } from "@/lib/publication-status";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; workId: string }> };

export async function GET(_request: Request, context: Context) { const { projectId, workId } = await context.params; return NextResponse.json({ check: latestPublicationStatusCheck(projectId, workId) ?? { checkState: "unchecked", status: "unknown" } }); }
export async function POST(request: Request, context: Context) {
  const { projectId, workId } = await context.params; const workspace = await readWorkspace(projectId); const work = workspace.works.find((item) => item.id === workId); if (!work) return NextResponse.json({ error: "Work不属于当前项目。" }, { status: 404 });
  const body = await request.json().catch(() => ({})); const result = await checkPublicationStatus({ projectId, workId, doi: typeof body.doi === "string" ? body.doi : work.doi, title: work.title, authors: work.authors.split(/;|\band\b/i) }); return NextResponse.json({ check: result });
}

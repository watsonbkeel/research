import { NextResponse } from "next/server";
import { workImportSchema } from "@/lib/schemas";
import { readWorkspace } from "@/lib/storage";
import { projectIdFromRequest } from "@/lib/request-context";
import { saveCandidateRecord, stableCandidateId } from "@/lib/evidence-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = workImportSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "文献元数据无效", details: parsed.error.flatten() }, { status: 400 });
  try {
    const projectId = projectIdFromRequest(request);
    const candidate = saveCandidateRecord({ id: stableCandidateId(projectId, "manual", parsed.data.doi ?? parsed.data.title), projectId, provider: "manual", providerRecordId: parsed.data.doi ?? parsed.data.title, title: parsed.data.title, authors: parsed.data.authors.split(/;|,/).map((item) => item.trim()).filter(Boolean), year: parsed.data.year, venue: parsed.data.venue, doi: parsed.data.doi, abstract: parsed.data.abstract, url: parsed.data.url, status: "discovered" });
    return NextResponse.json({ candidate, workspace: await readWorkspace(projectId) }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}

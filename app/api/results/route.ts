import { NextResponse } from "next/server";
import { analysisRunSchema, readAnalysisRuns, saveAnalysisRun } from "@/lib/results";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json({ runs: readAnalysisRuns(projectIdFromRequest(request)) });
}

export async function PUT(request: Request) {
  const parsed = analysisRunSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "AnalysisRun无效。" }, { status: 400 });
  return NextResponse.json({ runs: saveAnalysisRun(parsed.data, projectIdFromRequest(request)) });
}

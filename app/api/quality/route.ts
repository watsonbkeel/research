import { NextResponse } from "next/server";
import { buildQualityReport } from "@/lib/quality";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(await buildQualityReport(projectIdFromRequest(request)));
}

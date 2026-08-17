import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/storage";
import { citationCoverage, validateClaims } from "@/lib/validation";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const workspace = await readWorkspace(projectIdFromRequest(request));
  const issues = validateClaims(workspace.claims, workspace.works);
  return NextResponse.json({
    valid: issues.every((issue) => issue.severity !== "error"),
    citationCoverage: citationCoverage(workspace.claims),
    issues,
  });
}

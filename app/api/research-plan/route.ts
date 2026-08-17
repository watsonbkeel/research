import { NextResponse } from "next/server";
import {
  patchResearchPlan,
  readResearchPlan,
  ResearchPlanValidationError,
  researchPlanInputSchema,
  researchPlanPatchSchema,
  saveResearchPlan,
} from "@/lib/research-plan";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

async function jsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ResearchPlanValidationError("请求体必须是有效JSON。");
  }
}

export async function GET(request: Request) {
  return NextResponse.json(await readResearchPlan(projectIdFromRequest(request)));
}

export async function PUT(request: Request) {
  try {
    const parsed = researchPlanInputSchema.parse(await jsonBody(request));
    return NextResponse.json(await saveResearchPlan(parsed, projectIdFromRequest(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "研究计划无效。" }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const parsed = researchPlanPatchSchema.parse(await jsonBody(request));
    return NextResponse.json(await patchResearchPlan(parsed, projectIdFromRequest(request)));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "研究计划更新无效。" }, { status: 400 });
  }
}

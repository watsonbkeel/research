import { NextResponse } from "next/server";
import { readReviewWorkflow, reviewWorkflowSchema, saveReviewWorkflow } from "@/lib/review-workflow";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) { return NextResponse.json(readReviewWorkflow(projectIdFromRequest(request))); }
export async function PUT(request: Request) { const parsed = reviewWorkflowSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "ReviewProtocol无效。" }, { status: 400 }); return NextResponse.json(saveReviewWorkflow(parsed.data, projectIdFromRequest(request))); }

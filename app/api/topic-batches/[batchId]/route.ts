import { NextResponse } from "next/server";
import { getTopicBatch, listTopicCandidates } from "@/lib/portfolio";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ batchId: string }> }) { const { batchId } = await context.params; const batch = getTopicBatch(batchId); return batch ? NextResponse.json({ batch, candidates: listTopicCandidates(batchId) }) : NextResponse.json({ error: "候选批次不存在。" }, { status: 404 }); }

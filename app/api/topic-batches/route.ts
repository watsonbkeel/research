import { NextResponse } from "next/server";
import { createResearchJob } from "@/lib/assistant";
import { createTopicBatch, listTopicBatches, topicBatchInputSchema } from "@/lib/portfolio";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ batches: listTopicBatches() }); }
export async function POST(request: Request) {
  const parsed = topicBatchInputSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "候选批次无效。" }, { status: 400 });
  const batch = createTopicBatch(parsed.data);
  const job = createResearchJob({ prompt: parsed.data.brief, kind: "topic-batch-assessment", input: { topicBatchId: batch.id, ...(parsed.data.profileId ? { profileId: parsed.data.profileId } : {}) } });
  return NextResponse.json({ batch, job }, { status: 202 });
}

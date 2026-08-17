/* eslint-disable @typescript-eslint/no-explicit-any */
import { getResearchJob, listJobEvents } from "@/lib/assistant";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await context.params;
  if (!getResearchJob(jobId)) return new Response("Job not found", { status: 404 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let cursor = Number(new URL(request.url).searchParams.get("after") ?? 0) || 0;
  const close = (controller: ReadableStreamDefaultController) => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    controller.close();
  };
  const stream = new ReadableStream({
    start(controller) {
      const emit = () => {
        if (closed) return;
        for (const event of listJobEvents(jobId, cursor) as Array<any>) {
          cursor = event.id;
          controller.enqueue(encoder.encode(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`));
        }
        const job = getResearchJob(jobId);
        if (!job || ["completed", "failed", "cancelled"].includes(job.status)) close(controller);
      };
      emit();
      if (!closed) timer = setInterval(emit, 1000);
      request.signal.addEventListener("abort", () => close(controller), { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

import { NextResponse } from "next/server";
import { workImportSchema } from "@/lib/schemas";
import { importWork } from "@/lib/storage";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = workImportSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "文献元数据无效", details: parsed.error.flatten() }, { status: 400 });
  try {
    return NextResponse.json(await importWork(parsed.data, projectIdFromRequest(request)));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 409 });
  }
}

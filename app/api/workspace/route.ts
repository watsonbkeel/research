import { NextResponse } from "next/server";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await readWorkspace());
}

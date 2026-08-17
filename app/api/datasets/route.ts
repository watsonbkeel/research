import { NextResponse } from "next/server";
import { datasetRegistrySchema, readDatasetRegistry, saveDatasetRegistry } from "@/lib/datasets";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(readDatasetRegistry(projectIdFromRequest(request)));
}

export async function PUT(request: Request) {
  const parsed = datasetRegistrySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dataset注册表无效。" }, { status: 400 });
  return NextResponse.json(saveDatasetRegistry(parsed.data, projectIdFromRequest(request)));
}

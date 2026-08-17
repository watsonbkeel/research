import { NextResponse } from "next/server";
import { materialRegistrySchema, readMaterialRegistry, saveMaterialRegistry } from "@/lib/materials";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";
export async function GET(request: Request) { return NextResponse.json(readMaterialRegistry(projectIdFromRequest(request))); }
export async function PUT(request: Request) { const parsed = materialRegistrySchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "研究材料配置无效。" }, { status: 400 }); return NextResponse.json(saveMaterialRegistry(parsed.data, projectIdFromRequest(request))); }

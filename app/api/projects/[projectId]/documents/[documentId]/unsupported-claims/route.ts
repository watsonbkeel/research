import { NextResponse } from "next/server";
import { listUnsupportedClaims } from "@/lib/assistant-tools";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ projectId: string; documentId: string }> }) { const { projectId, documentId } = await context.params; try { return NextResponse.json({ claims: await listUnsupportedClaims(projectId, documentId) }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "读取失败" }, { status: 404 }); } }

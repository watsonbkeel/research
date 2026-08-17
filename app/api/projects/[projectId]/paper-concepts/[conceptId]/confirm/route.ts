import { NextResponse } from "next/server";
import { confirmPaperConcept } from "@/lib/project-documents";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ projectId: string; conceptId: string }> }) { const { projectId, conceptId } = await context.params; try { return NextResponse.json({ document: confirmPaperConcept(projectId, conceptId) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "论文建议确认失败。" }, { status: 400 }); } }

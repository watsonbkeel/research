import { NextResponse } from "next/server";
import { createPaperConcept, listPaperConcepts, paperConceptInputSchema } from "@/lib/project-documents";

export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string }> };
export async function GET(_request: Request, context: Context) { const { projectId } = await context.params; return NextResponse.json({ concepts: listPaperConcepts(projectId) }); }
export async function POST(request: Request, context: Context) { const { projectId } = await context.params; const parsed = paperConceptInputSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 }); try { return NextResponse.json({ concept: createPaperConcept(projectId, parsed.data) }, { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "论文建议创建失败。" }, { status: 400 }); } }

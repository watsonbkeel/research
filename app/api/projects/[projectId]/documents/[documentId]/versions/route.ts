import { NextResponse } from "next/server";
import { listDocumentVersions, restoreProjectDocumentVersion } from "@/lib/project-documents";
export const runtime = "nodejs";
type Context = { params: Promise<{ projectId: string; documentId: string }> };
export async function GET(_request: Request, context: Context) { const { projectId, documentId } = await context.params; try { return NextResponse.json({ versions: listDocumentVersions(projectId, documentId), versionKind: "immutable-document-version" }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "版本加载失败。" }, { status: 404 }); } }
export async function POST(request: Request, context: Context) { const { projectId, documentId } = await context.params; const body = await request.json().catch(() => ({})); try { return NextResponse.json(restoreProjectDocumentVersion(projectId, documentId, String(body.versionId ?? ""))); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "版本恢复失败。" }, { status: 400 }); } }

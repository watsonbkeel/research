import { DELETE as legacyDELETE, GET as legacyGET, PATCH as legacyPATCH, POST as legacyPOST } from "@/app/api/evidence-excerpts/route";
import { scopeRequestToProject } from "@/lib/request-context";
type Context = { params: Promise<{ projectId: string }> }; export const runtime = "nodejs";
export async function GET(request: Request, context: Context) { return legacyGET(scopeRequestToProject(request, (await context.params).projectId)); }
export async function POST(request: Request, context: Context) { return legacyPOST(scopeRequestToProject(request, (await context.params).projectId)); }
export async function PATCH(request: Request, context: Context) { return legacyPATCH(scopeRequestToProject(request, (await context.params).projectId)); }
export async function DELETE(request: Request, context: Context) { return legacyDELETE(scopeRequestToProject(request, (await context.params).projectId)); }

import { GET as legacyGET, PATCH as legacyPATCH, PUT as legacyPUT } from "@/app/api/research-plan/route";
import { scopeRequestToProject } from "@/lib/request-context";
type Context = { params: Promise<{ projectId: string }> };
export const runtime = "nodejs";
export async function GET(request: Request, context: Context) { return legacyGET(scopeRequestToProject(request, (await context.params).projectId)); }
export async function PUT(request: Request, context: Context) { return legacyPUT(scopeRequestToProject(request, (await context.params).projectId)); }
export async function PATCH(request: Request, context: Context) { return legacyPATCH(scopeRequestToProject(request, (await context.params).projectId)); }

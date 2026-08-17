import { GET as legacyGET, PUT as legacyPUT } from "@/app/api/results/route"; import { scopeRequestToProject } from "@/lib/request-context";
type Context = { params: Promise<{ projectId: string }> }; export const runtime = "nodejs";
export async function GET(request: Request, context: Context) { return legacyGET(scopeRequestToProject(request, (await context.params).projectId)); }
export async function PUT(request: Request, context: Context) { return legacyPUT(scopeRequestToProject(request, (await context.params).projectId)); }

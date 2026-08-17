import { GET as legacyGET } from "@/app/api/quality/route"; import { scopeRequestToProject } from "@/lib/request-context";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) { return legacyGET(scopeRequestToProject(request, (await context.params).projectId)); }

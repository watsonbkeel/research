import { NextResponse } from "next/server";
import { institutionProfileSchema, readInstitutionProfile } from "@/lib/institution";
import { projectIdFromRequest } from "@/lib/request-context";
import { saveInstitutionProfileWithDocumentSnapshots } from "@/lib/project-documents";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(readInstitutionProfile(projectIdFromRequest(request)));
}

export async function PUT(request: Request) {
  const parsed = institutionProfileSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "院校配置无效。" }, { status: 400 });
  const result = saveInstitutionProfileWithDocumentSnapshots(projectIdFromRequest(request), parsed.data);
  return NextResponse.json(result.profile, { headers: { "x-affected-document-count": String(result.documentVersions.length) } });
}

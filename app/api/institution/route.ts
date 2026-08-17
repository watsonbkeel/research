import { NextResponse } from "next/server";
import { institutionProfileSchema, readInstitutionProfile, saveInstitutionProfile } from "@/lib/institution";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return NextResponse.json(readInstitutionProfile(projectIdFromRequest(request)));
}

export async function PUT(request: Request) {
  const parsed = institutionProfileSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "院校配置无效。" }, { status: 400 });
  return NextResponse.json(saveInstitutionProfile(parsed.data, projectIdFromRequest(request)));
}

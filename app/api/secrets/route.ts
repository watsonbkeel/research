import { NextResponse } from "next/server";
import { localSecretUpdateSchema } from "@/lib/schemas";
import { deleteLocalSecret, saveLocalSecret } from "@/lib/secret-resolver";
import { readPrivateSettings, toPublicSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = localSecretUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "API Key无效。" }, { status: 400 });
  }
  const settings = await readPrivateSettings();
  const profile = settings.profiles.find((candidate) => candidate.id === parsed.data.profileId);
  if (!profile) return NextResponse.json({ error: "模型配置不存在，请先保存模型配置。" }, { status: 404 });

  try {
    saveLocalSecret(profile.apiKeyRef, parsed.data.apiKey);
    const publicProfile = toPublicSettings(settings).profiles.find((candidate) => candidate.id === profile.id);
    return NextResponse.json({ ok: true, profile: publicProfile });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "保存API Key失败。" }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "缺少模型配置ID。" }, { status: 400 });
  const settings = await readPrivateSettings();
  const profile = settings.profiles.find((candidate) => candidate.id === profileId);
  if (!profile) return NextResponse.json({ error: "模型配置不存在。" }, { status: 404 });
  deleteLocalSecret(profile.apiKeyRef);
  return NextResponse.json({ ok: true, profileId, hasApiKey: false });
}

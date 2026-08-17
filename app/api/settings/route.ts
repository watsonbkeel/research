import { NextResponse } from "next/server";
import { modelSettingsSchema } from "@/lib/schemas";
import { deleteModelProfile, readPrivateSettings, saveSettings, toPublicSettings } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(toPublicSettings(await readPrivateSettings()));
}

export async function PUT(request: Request) {
  const parsed = modelSettingsSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "设置无效" }, { status: 400 });
  }
  return NextResponse.json(await saveSettings(parsed.data));
}

export async function DELETE(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "缺少模型配置ID。" }, { status: 400 });
  try {
    return NextResponse.json(await deleteModelProfile(profileId));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除模型配置失败。" },
      { status: 409 },
    );
  }
}

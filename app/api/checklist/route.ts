import { NextResponse } from "next/server";
import { checklistUpdateSchema } from "@/lib/schemas";
import { updateChecklist } from "@/lib/storage";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const parsed = checklistUpdateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "无效的检查项更新", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    return NextResponse.json(await updateChecklist(parsed.data.id, parsed.data.status, projectIdFromRequest(request)));
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 404 });
  }
}

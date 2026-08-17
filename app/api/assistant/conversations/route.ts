import { NextResponse } from "next/server";
import { conversationInputSchema, createConversation, listConversations } from "@/lib/assistant";
export const runtime = "nodejs";
export async function GET(request: Request) { return NextResponse.json({ conversations: listConversations(new URL(request.url).searchParams.get("projectId") ?? undefined) }); }
export async function POST(request: Request) { const parsed = conversationInputSchema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 }); return NextResponse.json({ conversation: createConversation(parsed.data) }, { status: 201 }); }

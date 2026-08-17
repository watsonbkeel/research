import { NextResponse } from "next/server";
import {
  createEvidenceExcerpt,
  deleteEvidenceExcerpt,
  EvidenceExcerptValidationError,
  listClaimEvidenceLinks,
  listEvidenceExcerpts,
  updateEvidenceExcerpt,
  type EvidenceExcerptInput,
  type EvidenceExcerptPatch,
} from "@/lib/evidence-excerpts";
import { readWorkspace } from "@/lib/storage";
import { projectIdFromRequest } from "@/lib/request-context";

export const runtime = "nodejs";

function requestError(error: unknown) {
  if (error instanceof EvidenceExcerptValidationError) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ error: "EvidenceExcerpt操作失败。" }, { status: 500 });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filters = {
    id: params.get("id") ?? undefined,
    workId: params.get("workId") ?? undefined,
    claimId: params.get("claimId") ?? undefined,
    projectId: projectIdFromRequest(request),
  };
  try {
    const excerpts = await listEvidenceExcerpts(filters);
    if (filters.claimId) {
      return NextResponse.json({ excerpts, links: await listClaimEvidenceLinks(filters.claimId, filters.projectId) });
    }
    return NextResponse.json({ excerpts });
  } catch (error) {
    return requestError(error);
  }
}

export async function POST(request: Request) {
  let body: EvidenceExcerptInput;
  try {
    body = await request.json() as EvidenceExcerptInput;
  } catch {
    return NextResponse.json({ error: "请求JSON无效。" }, { status: 400 });
  }
  try {
    const projectId = projectIdFromRequest(request);
    const workspace = await readWorkspace(projectId);
    if (!workspace.works.some((work) => work.id === body.workId)) return NextResponse.json({ error: "workId不存在，请先登记该文献。" }, { status: 400 });
    if (body.claimId && !workspace.claims.some((claim) => claim.id === body.claimId)) return NextResponse.json({ error: "claimId不存在，请先登记该论断。" }, { status: 400 });
    return NextResponse.json({ excerpt: await createEvidenceExcerpt(body, projectId) }, { status: 201 });
  } catch (error) {
    return requestError(error);
  }
}

export async function PATCH(request: Request) {
  let body: EvidenceExcerptPatch;
  try {
    body = await request.json() as EvidenceExcerptPatch;
  } catch {
    return NextResponse.json({ error: "请求JSON无效。" }, { status: 400 });
  }
  const id = body?.id ?? new URL(request.url).searchParams.get("id") ?? "";
  try {
    return NextResponse.json({ excerpt: await updateEvidenceExcerpt({ ...body, id }, projectIdFromRequest(request)) });
  } catch (error) {
    return requestError(error);
  }
}

export async function DELETE(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "缺少EvidenceExcerpt ID。" }, { status: 400 });
  try {
    await deleteEvidenceExcerpt(id, projectIdFromRequest(request));
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    return requestError(error);
  }
}

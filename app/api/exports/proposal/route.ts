import { exportConfirmationProposal } from "@/lib/proposal-exporter";
import { listEvidenceExcerpts } from "@/lib/evidence-excerpts";
import { readInstitutionProfile } from "@/lib/institution";
import { readManuscript } from "@/lib/manuscript";
import { readResearchPlan } from "@/lib/research-plan";
import { readWorkspace } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const [workspace, manuscript, researchPlan, institution, evidence] = await Promise.all([readWorkspace(), Promise.resolve(readManuscript()), readResearchPlan(), Promise.resolve(readInstitutionProfile()), listEvidenceExcerpts()]);
  const body = await exportConfirmationProposal({ workspace, manuscript, researchPlan, institution, evidence });
  return new Response(new Uint8Array(body), { headers: { "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "content-disposition": 'attachment; filename="confirmation-proposal.docx"', "cache-control": "no-store" } });
}

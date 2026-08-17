import { NextResponse } from "next/server";
import { createPaperConcept, listPaperConcepts } from "@/lib/project-documents";
import { getProject } from "@/lib/portfolio";
import { readWorkspace } from "@/lib/storage";
import { readResearchPlan } from "@/lib/research-plan";
export const runtime = "nodejs";
export async function POST(_request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await context.params; const project = getProject(projectId); if (!project) return NextResponse.json({ error: "项目不存在。" }, { status: 404 });
  const existing = listPaperConcepts(projectId); if (existing.length) return NextResponse.json({ concepts: existing });
  const [workspace, plan] = await Promise.all([readWorkspace(projectId), readResearchPlan(projectId)]);
  const studies = workspace.experiments.slice(0, 3);
  const concepts = (studies.length ? studies : [{ id: "programme", name: "Overall research programme", objective: `Address the central research problem in ${project.context}.`, primaryTest: "Develop a defensible empirical test.", design: "To be registered", conditions: [], constants: [], ethics: "" }]).map((study, index) => createPaperConcept(projectId, {
    title: `${project.titleEn}${studies.length > 1 ? `: ${study.name}` : ""}`,
    centralQuestion: study.objective,
    contribution: study.primaryTest,
    linkedStudyIds: studies.length ? [study.id] : [],
    linkedHypothesisIds: plan.hypotheses.filter((hypothesis) => hypothesis.studyIds.includes(study.id)).map((hypothesis) => hypothesis.id),
    targetJournal: "",
    overlapWarning: index > 0 ? "Check theoretical contribution and outcome overlap against the other suggested papers before confirmation." : "",
  }));
  return NextResponse.json({ concepts }, { status: 201 });
}

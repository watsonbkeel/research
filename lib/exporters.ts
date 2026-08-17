import type { WorkspaceData, Work } from "./types";
import { validateClaims } from "./validation";

function escapeBib(value: string) {
  return value.replace(/[{}]/g, "");
}

function citationKey(work: Work) {
  const surname = work.authors.split(/[,&]/)[0].trim().replace(/[^A-Za-z]/g, "") || "work";
  return `${surname.toLowerCase()}${work.year}`;
}

function bibtexType(work: Work) {
  switch (work.sourceType) {
    case "book": return "book";
    case "chapter": return "incollection";
    case "conference-paper": return "inproceedings";
    case "thesis": return "phdthesis";
    case "report": return "techreport";
    case "web-page": return "online";
    case "dataset": return "misc";
    default: return "article";
  }
}

export function exportBibtex(workspace: WorkspaceData): string {
  return workspace.works
    .map((work) => {
      const fields = [
        `  author = {${escapeBib(work.authors)}},`,
        `  title = {${escapeBib(work.title)}},`,
        `  year = {${work.year}},`,
        work.sourceType === "book" ? `  publisher = {${escapeBib(work.publisher ?? work.venue)}},` : null,
        work.sourceType === "chapter" ? `  booktitle = {${escapeBib(work.containerTitle ?? work.venue)}},` : null,
        work.sourceType !== "book" && work.sourceType !== "chapter" ? `  journal = {${escapeBib(work.containerTitle ?? work.venue)}},` : null,
        work.volume ? `  volume = {${escapeBib(work.volume)}},` : null,
        work.issue ? `  number = {${escapeBib(work.issue)}},` : null,
        work.pages ? `  pages = {${escapeBib(work.pages)}},` : null,
        work.url ? `  url = {${escapeBib(work.url)}},` : null,
        work.accessedDate ? `  urldate = {${escapeBib(work.accessedDate)}},` : null,
        work.doi ? `  doi = {${work.doi}},` : null,
        `  note = {Evidence status: ${work.status}}`,
      ].filter(Boolean);
      return `@${bibtexType(work)}{${citationKey(work)},\n${fields.join("\n")}\n}`;
    })
    .join("\n\n");
}

export function exportMarkdown(workspace: WorkspaceData): string {
  const validation = validateClaims(workspace.claims, workspace.works);
  const lines = [
    `# ${workspace.project.titleEn}`,
    "",
    `> ${workspace.project.titleZh}`,
    "",
    `- Version: ${workspace.project.version}`,
    `- Field: ${workspace.project.field}`,
    `- Context: ${workspace.project.context}`,
    `- Institution: ${workspace.project.institution}`,
    `- Primary outcome: ${workspace.project.primaryOutcome}`,
    `- Secondary outcome: ${workspace.project.secondaryOutcome}`,
    "",
    "## Research design",
    "",
    ...workspace.experiments.flatMap((experiment) => [
      `### ${experiment.name}`,
      "",
      experiment.objective,
      "",
      `Design: ${experiment.design}`,
      "",
      `Conditions: ${experiment.conditions.join("; ")}`,
      "",
      `Primary test: ${experiment.primaryTest}`,
      "",
    ]),
    "## Auditable novelty evidence",
    "",
    "| Dimension | Existing evidence | Proposed contribution | Status |",
    "|---|---|---|---|",
    ...workspace.novelty.map((item) => `| ${item.dimension} | ${item.existing} | ${item.proposed} | ${item.assessment} |`),
    "",
    "## Claim register",
    "",
    ...workspace.claims.map((claim) => {
      const citations = claim.citationIds.length > 0 ? claim.citationIds.join(", ") : "None";
      return `- **${claim.kind}** ${claim.text} [Evidence: ${citations}]`;
    }),
    "",
    "## Validation",
    "",
    validation.length === 0
      ? "No citation integrity issues detected."
      : validation.map((issue) => `- ${issue.severity.toUpperCase()}: ${issue.claimId} — ${issue.message}`).join("\n"),
    "",
    "> This export is a research design artifact, not a completed systematic review or a guarantee of originality.",
    "",
  ];
  return lines.join("\n");
}

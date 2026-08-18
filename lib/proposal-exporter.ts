import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { EvidenceExcerpt } from "./evidence-excerpts";
import type { InstitutionProfile } from "./institution";
import { referencesFor, renderCitationTokens } from "./citation-service";
import type { Manuscript } from "./manuscript";
import type { ResearchPlanState } from "./research-plan";
import type { WorkspaceData } from "./types";

const deep = "202B27";
const green = "176F52";
const muted = "5F6D67";
const line = "DCE3DF";

function english(value: string) {
  return value.replace(/[\u3400-\u9fff\uF900-\uFAFF]/g, "").replace(/[ \t]{2,}/g, " ").trim();
}

function run(value: string, options: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return new TextRun({ text: english(value), ...options });
}

function paragraph(value: string, options: { bold?: boolean; italics?: boolean; color?: string; after?: number } = {}) {
  return new Paragraph({ spacing: { after: options.after ?? 130, line: 310 }, children: [run(value, options)] });
}

function heading(value: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2 | typeof HeadingLevel.HEADING_3) {
  return new Paragraph({ text: english(value), heading: level, spacing: { before: 300, after: 140 } });
}

function bullet(value: string) {
  return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 290 }, children: [run(value)] });
}

function tableCell(value: string, header = false) {
  return new TableCell({
    borders: { top: { style: BorderStyle.SINGLE, size: 1, color: line }, bottom: { style: BorderStyle.SINGLE, size: 1, color: line }, left: { style: BorderStyle.SINGLE, size: 1, color: line }, right: { style: BorderStyle.SINGLE, size: 1, color: line } },
    shading: header ? { fill: deep } : undefined,
    children: [new Paragraph({ spacing: { after: 0 }, children: [run(value, { bold: header, color: header ? "FFFFFF" : undefined, size: header ? 18 : 17 })] })],
  });
}

function sectionContent(content: string) {
  const lines = english(content).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [paragraph("[Planned section. No approved English text has been saved yet.]", { color: muted, italics: true })];
  return lines.map((line) => {
    if (line.startsWith("### ")) return heading(line.slice(4), HeadingLevel.HEADING_3);
    if (line.startsWith("## ")) return heading(line.slice(3), HeadingLevel.HEADING_2);
    if (/^[-*]\s/.test(line)) return bullet(line.replace(/^[-*]\s+/, ""));
    return paragraph(line);
  });
}

function statusNote(manuscript: Manuscript, institution: InstitutionProfile) {
  const state = manuscript.status === "approved" ? "approved" : "draft";
  const target = institution.verificationStatus === "verified" ? institution.university : "generic Australian baseline";
  return `Document status: ${state}. Research status and university compliance must be confirmed by the candidate and supervisors. Target baseline: ${target}.`;
}

export async function exportConfirmationProposal(input: { workspace: WorkspaceData; manuscript: Manuscript; researchPlan: ResearchPlanState; evidence: EvidenceExcerpt[]; institution: InstitutionProfile }): Promise<Buffer> {
  const { workspace, manuscript, researchPlan, institution } = input;
  const sections = manuscript.chapters.flatMap((chapter) => chapter.sections.sort((a, b) => a.order - b.order));
  const citedIds = new Set<string>(sections.flatMap((section) => section.citationIds));
  const matrixRows = researchPlan.hypotheses.map((hypothesis) => {
    const study = workspace.experiments.find((item) => hypothesis.studyIds.includes(item.id));
    const analysis = researchPlan.analysisPlans.find((item) => item.hypothesisIds.includes(hypothesis.id));
    const construct = workspace.constructs.find((item) => hypothesis.constructIds.includes(item.id));
    return new TableRow({ children: [tableCell(study?.name ?? "Study not linked"), tableCell(hypothesis.number), tableCell(construct?.nameEn ?? "Construct not linked"), tableCell(analysis?.estimand ?? "Estimand pending"), tableCell(analysis?.model ?? "Analysis model pending")] });
  });
  const matrixTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: [tableCell("Study", true), tableCell("Hypothesis", true), tableCell("Construct", true), tableCell("Primary estimand", true), tableCell("Analysis", true)] }),
      ...(matrixRows.length ? matrixRows : [new TableRow({ children: [tableCell("Study matrix pending"), tableCell("Hypotheses pending"), tableCell("Constructs pending"), tableCell("Estimand pending"), tableCell("Analysis plan pending")] })]),
    ],
  });
  const body: Array<Paragraph | Table | TableOfContents> = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 700, after: 260 }, children: [run(manuscript.title || workspace.project.titleEn, { bold: true, color: deep, size: 34 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run("Confirmation Proposal", { bold: true, color: green, size: 24 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(`Version ${manuscript.version} · ${workspace.project.citationStyle}`, { color: muted, size: 18 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 620 }, children: [run(`${manuscript.candidate || "Candidate not specified"} · ${manuscript.school || "School not specified"}`, { color: muted, size: 18 })] }),
    paragraph(statusNote(manuscript, institution), { color: muted, italics: true }),
    heading("Declaration of originality and AI assistance", HeadingLevel.HEADING_1),
    paragraph("This proposal distinguishes researcher-authored decisions, AI-assisted drafting, evidence verification and supervisor approval. AI assistance does not establish evidence, authorship, originality or approval. No result, sample statistic, citation or source claim may be treated as completed unless registered and verified."),
    heading("Abstract", HeadingLevel.HEADING_1),
    paragraph(`This Confirmation Proposal presents the registered research programme for ${workspace.project.titleEn}. The registered primary outcome is ${workspace.project.primaryOutcome}; the secondary outcome is ${workspace.project.secondaryOutcome}. Planned studies and unverified evidence gaps are not presented as completed findings.`),
    paragraph("Abstract status: planned and subject to evidence, supervisor and institution-specific review.", { color: muted, italics: true }),
    heading("Keywords", HeadingLevel.HEADING_1),
    paragraph([workspace.project.field, workspace.project.context, workspace.project.primaryOutcome, workspace.project.secondaryOutcome].filter(Boolean).join("; ")),
    heading("Table of Contents", HeadingLevel.HEADING_1),
    new TableOfContents("Contents", { hyperlink: true, headingStyleRange: "1-4" }),
    heading("List of Tables", HeadingLevel.HEADING_1),
    ...manuscript.tables.map((table) => paragraph(`${table.number}. ${table.caption}`)),
    heading("List of Figures", HeadingLevel.HEADING_1),
    ...manuscript.figures.map((figure) => paragraph(`${figure.number}. ${figure.caption}`)),
    heading("List of Abbreviations and Key Terms", HeadingLevel.HEADING_1),
    ...manuscript.glossaryTerms.map((term) => paragraph(`${term.term}: ${term.definition}`)),
    heading("Research Programme Overview", HeadingLevel.HEADING_1),
    paragraph(workspace.experiments.length ? workspace.experiments.map((study) => `${study.name}: ${study.objective} Design: ${study.design}. Primary test: ${study.primaryTest}.`).join(" ") : "No registered study programme is currently available."),
    matrixTable,
    ...manuscript.chapters.sort((a, b) => a.order - b.order).flatMap((chapter) => [heading(`${chapter.number}. ${chapter.title}`, HeadingLevel.HEADING_1), ...chapter.sections.sort((a, b) => a.order - b.order).flatMap((section) => [new Paragraph({ text: `${section.number} ${section.title}`, heading: HeadingLevel.HEADING_2 }), ...sectionContent(renderCitationTokens(section.content, workspace.works, Array.from(citedIds)).content)])]),
    heading("References", HeadingLevel.HEADING_1),
    ...referencesFor(workspace.works, Array.from(citedIds)).map((item) => paragraph(item.text)),
    heading("Appendices", HeadingLevel.HEADING_1),
    ...manuscript.appendices.flatMap((appendix) => [new Paragraph({ text: `${appendix.number} ${appendix.title}`, heading: HeadingLevel.HEADING_2 }), ...sectionContent(appendix.content)]),
  ];
  const document = new Document({
    creator: "Doctoral Proposal Workbench", title: english(manuscript.title || workspace.project.titleEn), subject: "Confirmation Proposal", description: "Structured English doctoral confirmation proposal with traceable research objects.",
    styles: { default: { document: { run: { font: "Aptos", size: 22, color: deep }, paragraph: { spacing: { line: 300 } } } }, paragraphStyles: [{ id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 29, bold: true, color: green } }, { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 24, bold: true, color: deep } }, { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos", size: 22, bold: true, color: deep } }] },
    sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run("Confirmation Proposal | ", { color: muted, size: 17 }), new TextRun({ children: [PageNumber.CURRENT], color: muted, size: 17 })] })] }) }, children: body }],
  });
  return Packer.toBuffer(document);
}

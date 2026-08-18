import { AlignmentType, BorderStyle, Document, Footer, HeadingLevel, Packer, PageNumber, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import type { WorkspaceData } from "./types";
import { referencesFor } from "./citation-service";
import { validateClaims } from "./validation";

const deep = "202B27";
const muted = "5F6D67";
const line = "DCE3DF";

function english(value: string) { return value.replace(/[\u3400-\u9fff\uF900-\uFAFF]/g, "").replace(/[ \t]{2,}/g, " ").trim(); }
function run(value: string, options: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) { return new TextRun({ text: english(value), ...options }); }
function paragraph(value: string, options: { bold?: boolean; color?: string; after?: number } = {}) { return new Paragraph({ spacing: { after: options.after ?? 130, line: 310 }, children: [run(value, options)] }); }
function heading(value: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2) { return new Paragraph({ text: english(value), heading: level, spacing: { before: 300, after: 140 } }); }
function bullet(value: string) { return new Paragraph({ bullet: { level: 0 }, spacing: { after: 80, line: 290 }, children: [run(value)] }); }
function tableCell(value: string, header = false) { return new TableCell({ borders: { top: { style: BorderStyle.SINGLE, size: 1, color: line }, bottom: { style: BorderStyle.SINGLE, size: 1, color: line }, left: { style: BorderStyle.SINGLE, size: 1, color: line }, right: { style: BorderStyle.SINGLE, size: 1, color: line } }, shading: header ? { fill: deep } : undefined, children: [new Paragraph({ spacing: { after: 0 }, children: [run(value, { bold: header, color: header ? "FFFFFF" : undefined, size: header ? 18 : 17 })] })] }); }

/** Compatibility evidence-pack export. All substantive content comes from the project workspace. */
export async function exportDocx(workspace: WorkspaceData): Promise<Buffer> {
  const issues = validateClaims(workspace.claims, workspace.works);
  const citedIds = [...new Set(workspace.claims.flatMap((claim) => claim.citationIds))];
  const body: Array<Paragraph | Table> = [
    new Paragraph({ text: english(workspace.project.titleEn), heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    paragraph(`Version ${workspace.project.version} · ${workspace.project.field} · ${workspace.project.citationStyle}`, { color: muted }),
    paragraph("Preliminary research design and evidence-management export. Independent source verification, supervisor review and institutional confirmation remain required.", { color: "A94735" }),
    heading("Research focus", HeadingLevel.HEADING_1),
    paragraph(`Context: ${workspace.project.context}`),
    paragraph(`Primary outcome: ${workspace.project.primaryOutcome}`),
    paragraph(`Secondary outcome: ${workspace.project.secondaryOutcome}`),
    heading("Registered theories", HeadingLevel.HEADING_1),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: [tableCell("Theory", true), tableCell("Role", true), tableCell("Source Work IDs", true)] }), ...workspace.theories.map((theory) => new TableRow({ children: [tableCell(theory.name), tableCell(theory.role), tableCell(theory.sourceWorkIds.join(", ") || "Source pending")] }))] }),
    heading("Registered studies", HeadingLevel.HEADING_1),
    ...workspace.experiments.flatMap((experiment) => [heading(experiment.name, HeadingLevel.HEADING_2), paragraph(experiment.objective), paragraph(`Design: ${experiment.design}`), paragraph(`Conditions: ${experiment.conditions.join("; ") || "Pending"}`), paragraph(`Primary test: ${experiment.primaryTest}`), paragraph(`Ethics: ${experiment.ethics}`, { color: muted })]),
    heading("Claim register and audit", HeadingLevel.HEADING_1),
    paragraph(`${workspace.claims.length} claims registered; ${issues.filter((issue) => issue.severity === "error").length} blocking errors and ${issues.filter((issue) => issue.severity === "warning").length} warnings.`),
    ...workspace.claims.map((claim) => bullet(`${claim.kind}: ${claim.text} [${claim.citationIds.join(", ") || "no citation"}]`)),
    ...issues.map((issue) => bullet(`${issue.severity.toUpperCase()}: ${issue.claimId} - ${issue.message}`)),
    heading("References", HeadingLevel.HEADING_1),
    ...(referencesFor(workspace.works, citedIds).map((item) => paragraph(item.text)) || [paragraph("No references are currently connected.")]),
    paragraph("This export is not a completed systematic review, ethics approval, confirmation decision or guarantee of originality.", { bold: true, color: deep }),
  ];
  const document = new Document({ creator: "Doctoral Research Portfolio Workbench", title: english(workspace.project.titleEn), subject: "Project-scoped evidence pack", sections: [{ properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } }, footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [run("Project evidence pack | "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) }, children: body }] });
  return Packer.toBuffer(document);
}

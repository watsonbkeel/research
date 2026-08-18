import { AlignmentType, Document, Footer, Header, HeadingLevel, Packer, PageNumber, Paragraph, TextRun } from "docx";
import type { ProjectDocument } from "./project-documents";
import { prospectiveWatermark } from "./project-documents";
import type { ProjectRecord } from "./portfolio";
import type { WorkspaceData } from "./types";
import { renderCitationTokens, referencesFor } from "./citation-service";
import type { CitationAuditReport } from "./types";

export function safeFileSlug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "research-document";
}

export function exportProjectDocumentMarkdown(project: ProjectRecord, document: ProjectDocument, workspace?: WorkspaceData, audit?: CitationAuditReport) {
  const watermark = prospectiveWatermark(document);
  const cited = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const lines = [
    `# ${document.title}`,
    "",
    watermark ? `> **${watermark}**` : "",
    watermark ? "> Anticipated results and conditional discussion are not observed findings." : "",
    audit ? `> **DRAFT EVIDENCE AUDIT: ${audit.blockers.length} blocker(s), ${audit.warnings.length} warning(s). This file is not a formal approved export.**` : "",
    "",
    `- Project: ${project.titleEn}`,
    `- Document type: ${document.documentType}`,
    `- Mode: ${document.mode}`,
    `- Status: ${document.status}`,
    `- Target venue: ${document.targetVenue || "Not selected"}`,
    `- Updated: ${document.updatedAt}`,
    "",
  ];
  for (const chapter of document.manuscript.chapters) {
    lines.push(`## ${chapter.number}. ${chapter.title}`, "");
    for (const section of chapter.sections) { const rendered = workspace ? renderCitationTokens(section.content, workspace.works, cited).content : section.content.replace(/\[\[CITE:[^\]]+\]\]/g, ""); lines.push(rendered.trim() || "_[Section not drafted]_", ""); }
  }
  if (workspace) lines.push("## References", "", ...referencesFor(workspace.works, cited).map((item) => `- ${item.text}`), "");
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n");
}

export async function exportProjectDocumentDocx(project: ProjectRecord, document: ProjectDocument, workspace?: WorkspaceData, audit?: CitationAuditReport) {
  const watermark = prospectiveWatermark(document);
  const cited = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const body: Paragraph[] = [
    new Paragraph({ text: document.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 320 } }),
    ...(watermark ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: watermark, bold: true, color: "B42318", size: 24 })] })] : []),
    ...(audit ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: `DRAFT EVIDENCE AUDIT: ${audit.blockers.length} blocker(s), ${audit.warnings.length} warning(s)`, bold: true, color: "B42318", size: 20 })] })] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`${document.documentType} · ${document.mode} · ${document.status}`)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun(`Project: ${project.titleEn}`)] }),
  ];
  for (const chapter of document.manuscript.chapters) {
    body.push(new Paragraph({ text: `${chapter.number}. ${chapter.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: chapter.order > 0 }));
    for (const section of chapter.sections) {
      if (chapter.sections.length > 1) body.push(new Paragraph({ text: `${section.number} ${section.title}`, heading: HeadingLevel.HEADING_2 }));
      const renderedSection = workspace ? renderCitationTokens(section.content, workspace.works, cited).content : section.content.replace(/\[\[CITE:[^\]]+\]\]/g, "");
      const paragraphs = renderedSection.trim() ? renderedSection.split(/\n\s*\n/) : ["[Section not drafted]"];
      for (const value of paragraphs) body.push(new Paragraph({ text: value.replace(/\s+/g, " ").trim(), spacing: { after: 160, line: 360 } }));
    }
  }
  if (workspace) { body.push(new Paragraph({ text: "References", heading: HeadingLevel.HEADING_1 })); for (const item of referencesFor(workspace.works, cited)) body.push(new Paragraph({ text: item.text, spacing: { after: 120 } })); }
  const file = new Document({
    creator: "Doctoral Research Portfolio Workbench", title: document.title, subject: watermark || document.documentType,
    sections: [{
      headers: watermark ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: watermark, bold: true, color: "B42318", size: 16 })] })] }) } : undefined,
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun("Page "), new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
      children: body,
    }],
  });
  return Packer.toBuffer(file);
}

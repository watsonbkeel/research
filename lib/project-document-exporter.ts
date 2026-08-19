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
  const style = project.citationStyle === "GB/T 7714" ? "gb7714" as const : "apa" as const;
  const draftSummary = audit ? { blockers: audit.blockers.length, warnings: audit.warnings.length, unsupported: audit.blockers.filter((item) => ["unsupported-published-fact", "uncovered-published-fact"].includes(item.code)).length, uncheckedPublication: audit.blockers.filter((item) => item.code.includes("publication-status-unchecked")).length } : undefined;
  const cited = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const lines = [
    `# ${document.title}`,
    "",
    watermark ? `> **${watermark}**` : "",
    watermark ? "> Anticipated results and conditional discussion are not observed findings." : "",
    audit ? "> **研究草稿——尚未通过正式证据与质量审查，不得作为正式提交版本**" : "",
    audit ? `> Version: ${audit.documentVersionId ?? audit.versionId}; blockers: ${draftSummary?.blockers}; warnings: ${draftSummary?.warnings}; unsupported published facts: ${draftSummary?.unsupported}; unchecked publication status: ${draftSummary?.uncheckedPublication}; exported: ${new Date().toISOString()}` : "",
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
    for (const section of chapter.sections) { const rendered = workspace ? renderCitationTokens(section.content, workspace.works, cited, style).content : section.content.replace(/\[\[CITE:[^\]]+\]\]/g, ""); lines.push(rendered.trim() || "_[Section not drafted]_", ""); }
  }
  if (workspace) lines.push("## References", "", ...referencesFor(workspace.works, cited, style).map((item) => `- ${item.text}`), "");
  return lines.filter((line, index) => line !== "" || lines[index - 1] !== "").join("\n");
}

export async function exportProjectDocumentDocx(project: ProjectRecord, document: ProjectDocument, workspace?: WorkspaceData, audit?: CitationAuditReport) {
  const watermark = prospectiveWatermark(document);
  const style = project.citationStyle === "GB/T 7714" ? "gb7714" as const : "apa" as const;
  const cited = [...new Set(document.manuscript.chapters.flatMap((chapter) => chapter.sections.flatMap((section) => section.citationIds)))];
  const body: Paragraph[] = [
    new Paragraph({ text: document.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, spacing: { after: 320 } }),
    ...(watermark ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: watermark, bold: true, color: "B42318", size: 24 })] })] : []),
    ...(audit ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: "研究草稿——尚未通过正式证据与质量审查，不得作为正式提交版本", bold: true, color: "B42318", size: 20 })] }), new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: `Version ${audit.documentVersionId ?? audit.versionId}; ${audit.blockers.length} blocker(s); ${audit.warnings.length} warning(s); exported ${new Date().toISOString()}`, color: "B42318", size: 18 })] })] : []),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun(`${document.documentType} · ${document.mode} · ${document.status}`)] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 480 }, children: [new TextRun(`Project: ${project.titleEn}`)] }),
  ];
  for (const chapter of document.manuscript.chapters) {
    body.push(new Paragraph({ text: `${chapter.number}. ${chapter.title}`, heading: HeadingLevel.HEADING_1, pageBreakBefore: chapter.order > 0 }));
    for (const section of chapter.sections) {
      if (chapter.sections.length > 1) body.push(new Paragraph({ text: `${section.number} ${section.title}`, heading: HeadingLevel.HEADING_2 }));
      const renderedSection = workspace ? renderCitationTokens(section.content, workspace.works, cited, style).content : section.content.replace(/\[\[CITE:[^\]]+\]\]/g, "");
      const paragraphs = renderedSection.trim() ? renderedSection.split(/\n\s*\n/) : ["[Section not drafted]"];
      for (const value of paragraphs) body.push(new Paragraph({ text: value.replace(/\s+/g, " ").trim(), spacing: { after: 160, line: 360 } }));
    }
  }
  if (workspace) { body.push(new Paragraph({ text: "References", heading: HeadingLevel.HEADING_1 })); for (const item of referencesFor(workspace.works, cited, style)) body.push(new Paragraph({ text: item.text, spacing: { after: 120 } })); }
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

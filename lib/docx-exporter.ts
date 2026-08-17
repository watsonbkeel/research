import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { ChecklistStatus, EvidenceStatus, WorkspaceData } from "./types";
import { validateClaims } from "./validation";

const green = "176F52";
const deep = "202B27";
const muted = "5F6D67";
const line = "DCE3DF";

const checklistStatus: Record<ChecklistStatus, string> = {
  "未开始": "Not started",
  "进行中": "In progress",
  "已满足": "Complete",
  "待确认": "Institutional confirmation required",
};

const evidenceStatus: Record<EvidenceStatus, string> = {
  "DOI已核对": "DOI verified",
  "书目信息已核对": "Bibliographic metadata verified",
  "摘要已核对": "Abstract reviewed",
  "全文已阅读": "Full text reviewed",
  "论断证据已定位": "Claim-level evidence located",
};

const roleLabel: Record<string, string> = {
  "情境基础": "Contextual foundation",
  "主导理论": "Primary theory",
  "机制理论": "Mechanism theory",
  "组织框架": "Organising framework",
};

const confirmationEnglish: Record<string, { title: string; evidence: string }> = {
  c1: { title: "Research significance and background", evidence: "Initial background narrative and marketplace context definition" },
  c2: { title: "Critical literature review", evidence: "Seed metadata library available; systematic search pending" },
  c3: { title: "Theoretical foundation and conceptual model", evidence: "Information asymmetry, signalling theory, and trust mechanism registered" },
  c4: { title: "Research questions and preregistered hypotheses", evidence: "Two-study design structure established; hypotheses pending" },
  c5: { title: "Methods, sample, and analysis plan", evidence: "Scale verification and Monte Carlo power analysis pending" },
  c6: { title: "Originality and contribution evidence", evidence: "Auditable novelty matrix available; no claim of absolute originality" },
  c7: { title: "Feasibility, resources, and timeline", evidence: "Target-university milestone calibration pending" },
  c8: { title: "Ethics, privacy, and data management", evidence: "Applicable institutional ethics pathway must be confirmed" },
  c9: { title: "AQF Level 10 and Confirmation requirements", evidence: "Target-university official requirements and access dates pending" },
  c10: { title: "Written submission and oral review preparation", evidence: "Full English proposal manuscript pending" },
};

const cellBorders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: line },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: line },
  left: { style: BorderStyle.SINGLE, size: 1, color: line },
  right: { style: BorderStyle.SINGLE, size: 1, color: line },
};

function text(value: string, options: { bold?: boolean; color?: string; size?: number; italics?: boolean } = {}) {
  return new TextRun({ text: value, ...options });
}

function body(value: string, options: { bold?: boolean; color?: string; after?: number } = {}) {
  return new Paragraph({
    spacing: { after: options.after ?? 120, line: 310 },
    children: [text(value, { bold: options.bold, color: options.color })],
  });
}

function bullet(value: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 80, line: 290 },
    children: [text(value)],
  });
}

function heading(value: string, level: typeof HeadingLevel.HEADING_1 | typeof HeadingLevel.HEADING_2) {
  return new Paragraph({ text: value, heading: level, spacing: { before: level === HeadingLevel.HEADING_1 ? 320 : 220, after: 130 } });
}

function tableCell(value: string, header = false, width?: number) {
  return new TableCell({
    width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
    borders: cellBorders,
    shading: header ? { fill: deep, type: ShadingType.CLEAR } : undefined,
    margins: { top: 110, right: 120, bottom: 110, left: 120 },
    children: [
      new Paragraph({
        spacing: { after: 0 },
        children: [text(value, { bold: header, color: header ? "FFFFFF" : undefined, size: header ? 19 : 18 })],
      }),
    ],
  });
}

function englishExperiment(experimentId: string) {
  if (experimentId === "experiment-1") {
    return {
      title: "Study 1: Listing Production Method",
      objective: "Estimate the overall effect of listing production method and test perceived information authenticity as the focal mechanism.",
      design: "One-factor, three-condition between-subjects experiment.",
      conditions: ["Seller-written listing with truthful attribution", "AI-assisted listing with truthful attribution", "AI-generated listing with truthful attribution"],
      controls: ["Product facts", "Price", "Images", "Information quantity", "Seller profile", "Listing length range"],
      test: "Listing production method → perceived information authenticity → seller-contact intention. Purchase intention is a secondary outcome.",
      ethics: "All source labels must be truthful. Data collection may begin only after the applicable institutional ethics pathway is completed.",
    };
  }

  if (experimentId === "experiment-2") {
    return {
      title: "Study 2: Provenance Transparency and Seller Reputation",
      objective: "Identify whether accountable AI provenance transparency interacts with seller reputation when the product description is held word-for-word constant.",
      design: "2 × 2 source-transparency-by-seller-reputation between-subjects factorial experiment.",
      conditions: ["Source transparency: basic AI-assisted label versus seller-verification-responsibility label", "Seller reputation: established seller (4.9/5, 128 transactions) versus new seller (no transaction history)"],
      controls: ["Identical AI-assisted listing copy", "Product facts", "Price", "Images", "Page layout"],
      test: "Primary interaction contrast on seller-contact intention: [(accountable − basic) | new] − [(accountable − basic) | established].",
      ethics: "Both labels truthfully disclose AI participation. The accountable label additionally states the seller's verification responsibility; neither condition conceals AI involvement.",
    };
  }

  return {
    title: experimentId,
    objective: "An English methods narrative has not yet been approved for this study.",
    design: "Design details require English editorial review.",
    conditions: [],
    controls: [],
    test: "Primary test requires confirmation.",
    ethics: "The applicable institutional ethics pathway must be completed before data collection.",
  };
}

function referenceParagraph(workspace: WorkspaceData, workId: string) {
  const work = workspace.works.find((candidate) => candidate.id === workId);
  if (!work) return body(`[Missing registered source: ${workId}]`, { color: "A94735" });
  const doi = work.doi ? ` https://doi.org/${work.doi}` : "";
  return new Paragraph({
    indent: { left: 720, hanging: 720 },
    spacing: { after: 130, line: 290 },
    children: [text(`${work.authors} (${work.year}). ${work.title}. `), text(work.venue, { italics: true }), text(`.${doi}`)],
  });
}

export async function exportDocx(workspace: WorkspaceData): Promise<Buffer> {
  const issues = validateClaims(workspace.claims, workspace.works);
  const factualClaims = workspace.claims.filter((claim) => claim.kind === "已发表事实");
  const citedWorks = Array.from(new Set(factualClaims.flatMap((claim) => claim.citationIds)));
  const completedItems = workspace.confirmation.filter((item) => item.status === "已满足").length;
  const theories = workspace.theories.map((theory) => new TableRow({
    children: [
      tableCell(theory.name, false, 36),
      tableCell(roleLabel[theory.role] ?? theory.role, false, 28),
      tableCell(theory.sourceWorkIds.length ? theory.sourceWorkIds.join(", ") : "Source required", false, 36),
    ],
  }));
  const experiments = workspace.experiments.flatMap((experiment) => {
    const study = englishExperiment(experiment.id);
    return [
      heading(study.title, HeadingLevel.HEADING_2),
      body(study.objective),
      body(`Design: ${study.design}`, { bold: true }),
      body("Conditions", { bold: true, after: 70 }),
      ...study.conditions.map(bullet),
      body("Controlled listing attributes", { bold: true, after: 70 }),
      ...study.controls.map(bullet),
      body(`Primary test: ${study.test}`),
      body(`Ethics boundary: ${study.ethics}`, { color: muted }),
    ];
  });

  const document = new Document({
    creator: "Doctoral Proposal Evidence Workbench",
    title: workspace.project.titleEn,
    subject: "Doctoral research proposal evidence pack",
    description: "English research-design export with auditable evidence boundaries.",
    styles: {
      default: { document: { run: { font: "Aptos", size: 22, color: deep }, paragraph: { spacing: { line: 290 } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 38, bold: true, color: deep }, paragraph: { spacing: { after: 160 } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 29, bold: true, color: green }, paragraph: { spacing: { before: 320, after: 130 } } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Aptos Display", size: 24, bold: true, color: deep }, paragraph: { spacing: { before: 220, after: 110 } } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      footers: {
        default: new Footer({
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [text("Doctoral Proposal Evidence Pack  |  ", { color: muted, size: 17 }), new TextRun({ children: [PageNumber.CURRENT], color: muted, size: 17 })] })],
        }),
      },
      children: [
        new Paragraph({ text: workspace.project.titleEn, style: "Title" }),
        body("Doctoral Research Proposal Evidence Pack", { bold: true, color: green }),
        body(`Version ${workspace.project.version} · ${workspace.project.field} · ${workspace.project.citationStyle}`, { color: muted }),
        new Paragraph({ spacing: { before: 220, after: 220 }, border: { top: { style: BorderStyle.SINGLE, size: 8, color: green }, bottom: { style: BorderStyle.SINGLE, size: 1, color: line } }, children: [text("STATUS", { bold: true, color: green, size: 18 }), text("  Preliminary research design. Independent literature verification, supervisor review, and institution-specific confirmation are required.", { size: 19 })] }),

        heading("1. Research Focus", HeadingLevel.HEADING_1),
        body("This project examines how AI-assisted product-description generation influences buyer responses in consumer-to-consumer second-hand marketplaces."),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ children: [tableCell("Research context", true, 34), tableCell("Online C2C second-hand marketplaces", true, 66)] }),
            new TableRow({ children: [tableCell("Primary outcome"), tableCell(workspace.project.primaryOutcome)] }),
            new TableRow({ children: [tableCell("Secondary outcome"), tableCell(workspace.project.secondaryOutcome)] }),
            new TableRow({ children: [tableCell("Focal mechanism"), tableCell("Perceived product-information authenticity")] }),
            new TableRow({ children: [tableCell("Boundary condition"), tableCell("Seller reputation")] }),
          ],
        }),
        body("Seller-contact intention and purchase intention are proxy outcomes. They must not be reported as completed transactions or realised sales conversion.", { color: "A94735" }),

        heading("2. Theoretical Framework", HeadingLevel.HEADING_1),
        body("Information asymmetry provides the market context, signalling theory is the primary explanatory theory, and e-commerce trust explains how observable cues may influence buyer responses. Stimulus–Organism–Response is used only as an organising framework."),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [new TableRow({ tableHeader: true, children: [tableCell("Theory", true, 36), tableCell("Role", true, 28), tableCell("Registered sources", true, 36)] }), ...theories],
        }),
        body("Candidate theoretical proposition: AI-assisted copy may improve perceived diagnosticity through clarity and completeness, while an AI source cue may reduce perceived authenticity. This is a proposition to be tested, not an established contribution."),

        heading("3. Research Questions", HeadingLevel.HEADING_1),
        bullet("RQ1. How does listing production method affect seller-contact intention in C2C second-hand marketplaces?"),
        bullet("RQ2. Does perceived product-information authenticity mediate the effect of listing production method on seller-contact intention?"),
        bullet("RQ3. Does seller reputation moderate buyer responses to an AI-assisted source label when listing content is held constant?"),
        bullet("RQ4. Under what conditions can AI-assisted listing information improve buyer-response proxies without creating an authenticity or trust penalty?"),

        heading("4. Proposed Methodology", HeadingLevel.HEADING_1),
        body("The core programme separates a content-production effect from a source-attribution effect. This prevents the design from treating an impossible 'no AI but AI disclosed' condition as part of a symmetric factorial experiment."),
        ...experiments,
        heading("Analysis and measurement gates", HeadingLevel.HEADING_2),
        bullet("Pretest listing stimuli for factual equivalence, length, information quantity, language quality, and manipulation strength across multiple products."),
        bullet("Verify the original sources, item wording, contextual adaptation, reliability, validity, and measurement invariance of all focal scales."),
        bullet("Base sample size on the smallest effect of interest for the primary interaction and indirect effect using Monte Carlo or equivalent simulation; pre-specify exclusions, attrition, and multiple-outcome handling."),

        heading("5. Australian Confirmation Readiness", HeadingLevel.HEADING_1),
        body(`${completedItems} of ${workspace.confirmation.length} common preparation items are currently marked complete. This checklist is a generic Australian baseline until the target university and faculty requirements are registered from official sources.`),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [tableCell("Requirement", true, 46), tableCell("Status", true, 24), tableCell("Current evidence", true, 30)] }),
            ...workspace.confirmation.map((item) => {
              const translated = confirmationEnglish[item.id] ?? {
                title: `Registered requirement ${item.id}`,
                evidence: "An approved English evidence narrative has not yet been provided.",
              };
              return new TableRow({ children: [tableCell(translated.title), tableCell(checklistStatus[item.status]), tableCell(translated.evidence)] });
            }),
          ],
        }),

        heading("6. Citation Integrity", HeadingLevel.HEADING_1),
        body(`${factualClaims.length} published-fact claim(s) are registered. The automated check reports ${issues.filter((issue) => issue.severity === "error").length} blocking error(s) and ${issues.filter((issue) => issue.severity === "warning").length} warning(s).`),
        ...issues.map((issue) => bullet(`${issue.severity.toUpperCase()}: ${issue.claimId} — ${issue.severity === "error" ? "A blocking citation-integrity rule was not satisfied." : "The claim is supported only by a metadata-level source; claim-level full-text evidence remains pending."}`)),
        body("A verified DOI or bibliographic record does not establish that a source supports a specific claim. Full-text review and claim-level evidence location remain separate requirements.", { color: muted }),

        heading("References", HeadingLevel.HEADING_1),
        ...(citedWorks.length ? citedWorks.map((id) => referenceParagraph(workspace, id)) : [body("No references are currently connected to published-fact claims.")]),

        heading("Evidence Library Appendix", HeadingLevel.HEADING_1),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: [tableCell("Source", true, 62), tableCell("Verification status", true, 38)] }),
            ...workspace.works.map((work) => new TableRow({ children: [tableCell(`${work.authors} (${work.year}). ${work.title}. ${work.venue}${work.doi ? ` DOI: ${work.doi}` : ""}`), tableCell(evidenceStatus[work.status])] })),
          ],
        }),
        body("This document is a research-design and evidence-management artifact. It is not a completed systematic review, ethics approval, confirmation decision, or guarantee of originality.", { bold: true, color: deep }),
      ],
    }],
  });

  return Packer.toBuffer(document);
}

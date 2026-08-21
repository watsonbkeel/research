import type { ProjectDocument } from "./project-documents";

export interface InstitutionEditorSection {
  id: string;
  number: string;
  title: string;
}

/** Institution required-section mappings belong to the project's Confirmation Proposal only. */
export function availableSectionsForInstitutionEditor(
  documents: Pick<ProjectDocument, "documentType" | "manuscript">[],
): InstitutionEditorSection[] {
  const proposal = documents.find((document) => document.documentType === "confirmation-proposal");
  if (!proposal) return [];
  return proposal.manuscript.chapters.flatMap((chapter) => chapter.sections.map((section) => ({
    id: section.id,
    number: section.number,
    title: section.title,
  })));
}

import { describe, expect, it } from "vitest";
import { availableSectionsForInstitutionEditor } from "@/lib/institution-editor-scope";

describe("Institution editor document scope", () => {
  it("always uses Confirmation Proposal sections, not the currently selected document", () => {
    const sections = availableSectionsForInstitutionEditor([
      { id: "journal", documentType: "journal-article", manuscript: { chapters: [{ sections: [{ id: "journal-section", number: "1", title: "Journal section" }] }] } } as never,
      { id: "proposal", documentType: "confirmation-proposal", manuscript: { chapters: [{ sections: [{ id: "proposal-section", number: "1", title: "Proposal section" }] }] } } as never,
    ]);
    expect(sections).toEqual([{ id: "proposal-section", number: "1", title: "Proposal section" }]);
  });

  it("returns no mappings when the project has no Confirmation Proposal", () => {
    expect(availableSectionsForInstitutionEditor([{ id: "journal", documentType: "journal-article", manuscript: { chapters: [] } } as never]).length).toBe(0);
  });
});

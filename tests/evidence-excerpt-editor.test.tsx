import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceExcerptEditor } from "@/components/EvidenceExcerptEditor";
import type { EvidenceExcerpt } from "@/lib/evidence-excerpts";

describe("EvidenceExcerptEditor", () => {
  it("renders all locator types and edit/review controls", () => {
    const markup = renderToStaticMarkup(
      <EvidenceExcerptEditor
        data={{ works: [] } as never}
        assets={[]}
        excerpts={[{ id: "old", workId: "work-1", locator: "Methods", paraphrase: "Note", supportDirection: "supporting", strength: "medium", relevance: "medium", verificationStatus: "unverified", rightsStatus: "unknown", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" } as EvidenceExcerpt]}
        saving={false}
        onSave={async () => undefined}
      />,
    );
    for (const value of ["page", "chapter", "section", "paragraph", "figure", "table"]) expect(markup).toContain(`value=\"${value}\"`);
    expect(markup).toContain("编辑");
    expect(markup).toContain("核验者");
    expect(markup).toContain("核验时间");
  });
});

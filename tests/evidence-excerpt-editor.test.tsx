import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvidenceExcerptEditor } from "@/components/EvidenceExcerptEditor";

describe("EvidenceExcerptEditor", () => {
  it("renders all locator types and edit/review controls", () => {
    const markup = renderToStaticMarkup(
      <EvidenceExcerptEditor
        data={{ works: [] } as never}
        assets={[]}
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

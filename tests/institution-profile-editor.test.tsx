import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InstitutionProfileEditor } from "@/components/InstitutionProfileEditor";
import { genericAustralianBaseline, type InstitutionProfile } from "@/lib/institution";

describe("InstitutionProfileEditor", () => {
  it("renders structured verification and required-section controls", () => {
    const profile: InstitutionProfile = {
      ...genericAustralianBaseline,
      id: "profile-editor",
      requiredSections: [{ key: "abstract", label: "Abstract", required: true }],
    };
    const markup = renderToStaticMarkup(
      <InstitutionProfileEditor
        profile={profile}
        availableSections={[{ id: "s-1", number: "1.1", title: "Research context" }]}
        saving={false}
        onSave={async () => undefined}
      />,
    );
    expect(markup).toContain("Verified by");
    expect(markup).toContain("Verified at");
    expect(markup).toContain("Source note");
    expect(markup).toContain("Mapped manuscript section");
    expect(markup).toContain("Section key");
    expect(markup).toContain("Aliases");
    expect(markup).toContain("Minimum characters");
    expect(markup).toContain("添加必填项");
    expect(markup).not.toContain("[object Object]");
    expect(markup).not.toContain("Required sections（每行一项）");
  });
});

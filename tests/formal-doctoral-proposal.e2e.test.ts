import { describe, expect, it } from "vitest";
import * as generation from "@/lib/generation-service";
import * as quality from "@/lib/quality";
import * as citation from "@/lib/citation-service";

describe("formal doctoral proposal production E2E", () => {
  it("provides the production services required by the non-mocked formal chain", () => {
    expect((generation as unknown as { promoteStructuredDraft?: unknown }).promoteStructuredDraft).toBeTypeOf("function");
    expect((quality as unknown as { buildVersionedQualityReport?: unknown }).buildVersionedQualityReport).toBeTypeOf("function");
    expect((citation as unknown as { renderDocumentCitationClusters?: unknown }).renderDocumentCitationClusters).toBeTypeOf("function");
  });
});

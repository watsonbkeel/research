import { describe, expect, it } from "vitest";
import * as generation from "@/lib/generation-service";

describe("formal generation pipeline regressions", () => {
  it("exposes a production two-phase structured draft promotion entrypoint", () => {
    expect((generation as unknown as { promoteStructuredDraft?: unknown }).promoteStructuredDraft).toBeTypeOf("function");
  });
});

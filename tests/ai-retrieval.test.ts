import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "@/server/ai";

describe("contesto degli strumenti AI", () => {
  it("richiede fonti solo quando ne sono state recuperate", () => {
    expect(buildSystemPrompt("DIRECT", [])).toContain("Non sono state recuperate fonti");
  });
});

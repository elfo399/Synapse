import { describe, expect, it } from "vitest";
import { buildSystemPrompt, parseToolPlan } from "@/server/ai";

describe("contratto degli strumenti AI", () => {
  it("accetta un catalogo tipizzato", () => {
    expect(parseToolPlan('{"tools":[{"name":"list_items","itemType":"PROJECT","limit":10}]}')).toMatchObject({
      ok: true,
      plan: { tools: [{ name: "list_items", itemType: "PROJECT", limit: 10 }] },
    });
  });

  it("rifiuta JSON, strumenti e tipi non validi", () => {
    expect(parseToolPlan("non json")).toEqual({ ok: false, reason: "invalid_json" });
    expect(parseToolPlan('{"tools":[{"name":"sql","query":"select"}]}')).toEqual({ ok: false, reason: "invalid_tool" });
    expect(parseToolPlan('{"tools":[{"name":"list_items","itemType":"ALL"}]}')).toEqual({ ok: false, reason: "invalid_tool" });
  });

  it("distingue fonti assenti da un contesto recuperato", () => {
    expect(buildSystemPrompt("DIRECT", [])).toContain("Non sono state recuperate fonti");
  });
});

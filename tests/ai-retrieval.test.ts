import { describe, expect, it } from "vitest";
import { asksForCatalog, knowledgeScope } from "@/server/ai";

describe("recupero strutturato delle conoscenze", () => {
  it("riconosce un elenco di progetti", () => {
    expect(knowledgeScope("Fammi l'elenco di tutti i progetti")).toBe(
      "PROJECT",
    );
    expect(asksForCatalog("Fammi l'elenco di tutti i progetti")).toBe(true);
  });

  it("riconosce gli altri cataloghi personali", () => {
    expect(knowledgeScope("Mostra tutte le aree")).toBe("AREA");
    expect(knowledgeScope("Quali risorse ho?")).toBe("RESOURCE");
    expect(knowledgeScope("Elenco delle attività")).toBe("TASK");
  });
});

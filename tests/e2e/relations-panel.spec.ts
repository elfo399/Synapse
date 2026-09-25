import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./authenticated";
import { getItemHref } from "../../src/domain/item-url";
import type { ItemDetail } from "../../src/domain/types";

test("the connections panel shows only manual semantic links from the current item", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const suffix = randomUUID().slice(0, 8);
  const created: ItemDetail[] = [];
  async function create(title: string, type: ItemDetail["type"] = "RESOURCE") {
    const response = await page.request.post("/api/items", {
      headers: { origin },
      data: { title, type, inbox: false },
    });
    expect(response.status()).toBe(201);
    const item = (await response.json()).item as ItemDetail;
    created.push(item);
    return item;
  }
  async function relate(
    sourceItemId: string,
    targetItemId: string,
    relationType: "RELATED" | "PARENT",
  ) {
    const response = await page.request.post("/api/relations", {
      headers: { origin },
      data: { sourceItemId, targetItemId, relationType },
    });
    expect(response.status()).toBe(201);
    return (await response.json()).relation as ItemDetail["outgoing"][number];
  }
  try {
    const area = await create(`Area relazioni ${suffix}`, "AREA");
    const source = await create(`Origine relazioni ${suffix}`);
    const target = await create(`Destinazione relazioni ${suffix}`);
    const manual = await relate(source.id, target.id, "RELATED");
    await relate(source.id, area.id, "PARENT");

    await page.goto(getItemHref(source));
    const panel = page.locator("#collegamenti");
    await expect(
      panel.getByText("Conoscenze collegate", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByText(target.title, { exact: true })).toBeVisible();
    await expect(panel.getByText(area.title, { exact: true })).toHaveCount(0);
    await expect(panel.getByText(/entrata|uscita|backlink/i)).toHaveCount(0);
    const targetDetail = await page.request.get(`/api/items/${target.id}`);
    expect(
      (await targetDetail.json()).item.incoming.map(
        (edge: { id: string }) => edge.id,
      ),
    ).toContain(manual.id);
    const graph = await page.request.get(`/api/graph?focus=${target.id}`);
    expect(
      (await graph.json()).edges.map((edge: { id: string }) => edge.id),
    ).toContain(manual.id);
    await panel
      .getByRole("button", {
        name: `Rimuovi il collegamento a ${target.title}`,
      })
      .click();
    await expect(
      panel.getByText("Nessuna conoscenza collegata."),
    ).toBeVisible();

    const afterRemoval = await page.request.get(`/api/items/${target.id}`);
    expect(
      (await afterRemoval.json()).item.incoming.map(
        (edge: { id: string }) => edge.id,
      ),
    ).not.toContain(manual.id);
  } finally {
    for (const item of [...created].reverse())
      await page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmed: true },
      });
  }
});

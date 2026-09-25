import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./authenticated";
import { getItemHref } from "../../src/domain/item-url";

test("sposta una risorsa nel Cestino e la ripristina", async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  const title = `Cestino browser ${randomUUID().slice(0, 8)}`;
  const created = await page.request.post("/api/items", {
    headers: { origin },
    data: { title, type: "RESOURCE", content: "Contenuto recuperabile", inbox: false },
  });
  expect(created.status()).toBe(201);
  const item = (await created.json()).item as { id: string };

  await page.goto(getItemHref({ id: item.id, title }));
  await page.getByRole("button", { name: "Sposta nel Cestino", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/Conferma il titolo/).fill(title);
  await dialog.getByRole("button", { name: "Sposta nel Cestino", exact: true }).click();
  await expect(page).toHaveURL(/\/trash$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ripristina gruppo", exact: true }).click();
  await expect(page.getByText("Il Cestino ? vuoto")).toBeVisible();
});

import { getItemId } from "../../src/domain/item-url";
import { test, expect } from "@playwright/test";

test("private workspace: login, capture, process, graph, archive and logout", async ({
  page,
}) => {
  await page.goto("/inbox");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "it");
  await expect(page).toHaveTitle(/Synapse/);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest).toMatchObject({
    name: "Synapse",
    short_name: "Synapse",
    lang: "it",
  });
  expect((await page.request.get("/api/items")).status()).toBe(401);
  await page
    .getByLabel("Indirizzo email")
    .fill(process.env.INITIAL_ADMIN_EMAIL!);
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.INITIAL_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Accedi", exact: true }).click();
  await expect(page).toHaveURL("/");
  const title = `Browser capture ${Date.now()}`;
  await page
    .getByRole("button", { name: /Annotazione rapida/ })
    .first()
    .click();
  await page.getByLabel("Titolo", { exact: true }).fill(title);
  await page
    .getByRole("dialog")
    .getByLabel("Contenuto", { exact: true })
    .fill("A focused idea from the browser smoke test.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salva l’idea", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/inbox");
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByLabel("Etichette", { exact: false }).fill("browser-test");
  await page.getByRole("button", { name: "Segna come organizzato" }).click();
  await expect(
    page.getByRole("button", { name: "Segna come organizzato" }),
  ).toHaveCount(0);
  const itemUrl = page.url();
  const itemId = getItemId(itemUrl.split("/").pop()!);
  await page
    .getByRole("navigation", { name: "Percorso" })
    .getByRole("link", { name: "Note", exact: true })
    .click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(
    page.getByRole("heading", { name: "Note", exact: true }),
  ).toBeVisible();
  const search = await page.request.get(
    `/api/search?q=${encodeURIComponent(title)}`,
  );
  expect(search.ok()).toBeTruthy();
  expect(
    (await search.json()).items.some(
      (item: { id: string }) => item.id === itemId,
    ),
  ).toBeTruthy();
  await page.goto("/graph");
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await page
    .getByText("Esplora i nodi con la tastiera", { exact: false })
    .click();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(
    page
      .getByRole("complementary", { name: "Elemento selezionato" })
      .getByRole("heading", { name: title }),
  ).toBeVisible();
  await page.goto(itemUrl);
  await page
    .getByRole("button", { name: "Archivia elemento", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Ripristina elemento", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Ripristina elemento", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Archivia elemento", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Elimina definitivamente", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", { name: "Elimina definitivamente" }),
  ).toBeDisabled();
  await dialog.getByLabel("Conferma il titolo dell’elemento").fill(title);
  await dialog.getByRole("button", { name: "Elimina definitivamente" }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await page.getByRole("button", { name: "Esci" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get("/api/graph")).status()).toBe(401);
});

import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { test } from "./authenticated";
import { getItemHref } from "../../src/domain/item-url";
import type { ItemDetail } from "../../src/domain/types";
test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
  "base64",
);
async function capture(page: Page) {
  await page.goto("/inbox");
  await page.keyboard.press("n");
  return page.getByRole("dialog", { name: "Cattura universale" });
}
async function savedItem(page: Page, action: () => Promise<unknown>) {
  const result = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/capture" &&
      response.request().method() === "POST",
  );
  await action();
  const response = await result;
  expect(response.status()).toBe(201);
  return (await response.json()).item as ItemDetail;
}
async function remove(page: Page, item: ItemDetail, origin: string) {
  expect(
    (
      await page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmed: true },
      })
    ).status(),
  ).toBe(200);
}

test("titleless text and pasted URL use universal capture and stable canonical URLs", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const created: ItemDetail[] = [];
  try {
    await page.goto("/");
    const content = `Un pensiero ${randomUUID().slice(0, 8)}`;
    await page
      .getByRole("textbox", { name: "Contenuto", exact: true })
      .fill(content);
    const note = await savedItem(page, () =>
      page.getByRole("button", { name: "Salva l’idea", exact: true }).click(),
    );
    created.push(note);
    expect(note).toMatchObject({ title: content, type: "RESOURCE", inbox: true });
    await page.goto(`/items/${note.id}`);
    await expect(page).toHaveURL(getItemHref(note));
    const oldUrl = getItemHref(note);
    const renamed = `${content} rinominato`;
    await page.getByLabel("Titolo", { exact: true }).fill(renamed);
    await page
      .getByRole("button", { name: "Salva modifiche", exact: true })
      .click();
    note.title = renamed;
    await expect(page).toHaveURL(getItemHref(note));
    await page.goto(oldUrl);
    await expect(page).toHaveURL(getItemHref(note));
    const dialog = await capture(page);
    await dialog
      .getByRole("textbox", { name: "Contenuto", exact: true })
      .evaluate((element) => {
        const data = new DataTransfer();
        data.setData("text/plain", "https://example.com/idee");
        element.dispatchEvent(
          new ClipboardEvent("paste", { bubbles: true, clipboardData: data }),
        );
      });
    await expect(dialog.getByLabel("URL", { exact: true })).toHaveValue(
      "https://example.com/idee",
    );
    const bookmark = await savedItem(page, () =>
      dialog.getByRole("button", { name: "Salva l’idea" }).click(),
    );
    created.push(bookmark);
    expect(bookmark).toMatchObject({
      type: "BOOKMARK",
      url: "https://example.com/idee",
      inbox: true,
    });
  } finally {
    for (const item of created) await remove(page, item, origin);
  }
});

for (const width of [1440, 390])
  test(`clipboard image, private preview, editor upload and removal (${width}px)`, async ({
    page,
    baseURL,
    playwright,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    let item: ItemDetail | undefined;
    try {
      const dialog = await capture(page);
      await dialog
        .getByRole("textbox", { name: "Contenuto", exact: true })
        .evaluate(
          (element, bytes) => {
            const data = new DataTransfer();
            data.items.add(
              new File([Uint8Array.from(bytes)], "schermata.png", {
                type: "image/png",
              }),
            );
            element.dispatchEvent(
              new ClipboardEvent("paste", {
                bubbles: true,
                clipboardData: data,
              }),
            );
          },
          [...png],
        );
      await expect(
        dialog.getByAltText("Anteprima di schermata.png"),
      ).toBeVisible();
      await expect(
        dialog.getByRole("button", { name: "Scatta foto" }),
      ).toBeVisible();
      await expect(dialog.getByLabel("Scatta una foto")).toHaveAttribute(
        "capture",
        "environment",
      );
      await page.screenshot({ path: testInfo.outputPath("capture-image.png") });
      item = await savedItem(page, () =>
        dialog.getByRole("button", { name: "Salva l’idea" }).click(),
      );
      expect(item.attachments).toHaveLength(1);
      const file = item.attachments![0];
      const anonymous = await playwright.request.newContext({
        baseURL,
        storageState: { cookies: [], origins: [] },
      });
      try {
        expect(
          (await anonymous.get(`/api/attachments/${file.id}`)).status(),
        ).toBe(401);
      } finally {
        await anonymous.dispose();
      }
      const download = await page.request.get(
        `/api/attachments/${file.id}?download=1`,
      );
      expect(await download.body()).toEqual(png);
      expect(download.headers()["content-disposition"]).toContain(
        "attachment;",
      );
      expect(download.headers()["x-content-type-options"]).toBe("nosniff");
      expect(
        (
          await page.request.get(`/api/attachments/${file.id}`, {
            headers: { range: "bytes=0-7" },
          })
        ).status(),
      ).toBe(206);
      expect(
        (
          await page.request.get(`/api/attachments/${file.id}`, {
            headers: { range: "bytes=9999-" },
          })
        ).status(),
      ).toBe(416);
      expect(
        (
          await page.request.delete(`/api/attachments/${file.id}`, {
            headers: { origin: "https://untrusted.invalid" },
            data: {},
          })
        ).status(),
      ).toBe(403);
      await page.goto(getItemHref(item));
      await expect(
        page.locator("#allegati").getByAltText("schermata.png"),
      ).toBeVisible();
      await page
        .locator("#allegati")
        .getByRole("button", { name: "Inserisci nel testo" })
        .click();
      await expect(
        page.getByRole("textbox", { name: "Contenuto", exact: true }),
      ).toHaveValue(new RegExp(file.id));
      await page
        .getByRole("button", { name: "Salva modifiche", exact: true })
        .click();
      await page
        .locator("#contenuto")
        .getByRole("button", { name: "Leggi", exact: true })
        .click();
      await expect(
        page.locator("#contenuto").getByAltText("schermata.png"),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("item-attachments.png"),
        fullPage: true,
      });
      await page
        .locator("#contenuto")
        .getByRole("button", { name: "Modifica contenuto", exact: true })
        .click();
      await page.getByLabel("Allegati del contenuto").setInputFiles({
        name: "altra.png",
        mimeType: "image/png",
        buffer: png,
      });
      await expect(
        page.getByRole("textbox", { name: "Contenuto", exact: true }),
      ).toHaveValue(/altra.png/);
      await expect(
        page.locator("#allegati").getByAltText("altra.png"),
      ).toBeVisible();
      await page
        .locator("#allegati")
        .getByRole("button", { name: "Elimina schermata.png", exact: true })
        .click();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Elimina allegato", exact: true })
        .click();
      await expect(
        page.locator("#allegati").getByAltText("schermata.png"),
      ).toHaveCount(0);
      expect(
        (await page.request.get(`/api/attachments/${file.id}`)).status(),
      ).toBe(404);
    } finally {
      if (item) await remove(page, item, origin);
    }
  });

test("file drop saves a resource and invalid media leaves no partial item", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  let item: ItemDetail | undefined;
  try {
    const dialog = await capture(page);
    await dialog.locator("form").evaluate((element) => {
      const data = new DataTransfer();
      data.items.add(
        new File(
          ["%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n"],
          "appunti.pdf",
          { type: "application/pdf" },
        ),
      );
      element.dispatchEvent(
        new DragEvent("drop", { bubbles: true, dataTransfer: data }),
      );
    });
    await expect(
      dialog.getByText("appunti.pdf", { exact: true }),
    ).toBeVisible();
    item = await savedItem(page, () =>
      dialog.getByRole("button", { name: "Salva l’idea" }).click(),
    );
    expect(item.type).toBe("RESOURCE");
    expect(item.attachments?.[0].mimeType).toBe("application/pdf");
    const before = (
      await (await page.request.get("/api/items?archive=all")).json()
    ).total;
    const rejected = await page.request.post("/api/capture", {
      headers: { origin },
      multipart: {
        payload: JSON.stringify({ title: `Bad ${randomUUID()}` }),
        files: {
          name: "bad.png",
          mimeType: "image/png",
          buffer: Buffer.from("<script>bad</script>"),
        },
      },
    });
    expect(rejected.status()).toBe(415);
    expect(
      (await (await page.request.get("/api/items?archive=all")).json()).total,
    ).toBe(before);
  } finally {
    if (item) await remove(page, item, origin);
  }
});

test.describe("browser microphone", () => {
  test("record, pause, resume, preview and save a voice memo", async ({
    page,
    baseURL,
  }) => {
    let item: ItemDetail | undefined;
    try {
      const dialog = await capture(page);
      await dialog.getByRole("button", { name: "Audio", exact: true }).click();
      await dialog
        .getByRole("button", { name: "Registra", exact: true })
        .click();
      await expect(
        dialog.getByText("Registrazione in corso", { exact: true }),
      ).toBeVisible();
      await expect(dialog.locator("time")).not.toHaveText("0:00");
      await dialog.getByRole("button", { name: "Pausa", exact: true }).click();
      await expect(dialog.getByText("In pausa", { exact: true })).toBeVisible();
      await dialog
        .getByRole("button", { name: "Riprendi", exact: true })
        .click();
      await dialog
        .getByRole("button", { name: "Termina", exact: true })
        .click();
      await expect(dialog.locator("audio")).toBeVisible();
      item = await savedItem(page, () =>
        dialog.getByRole("button", { name: "Salva l’idea" }).click(),
      );
      expect(item.title).toMatch(/^Memo vocale/);
      expect(item.attachments?.[0].mimeType).toBe("audio/webm");
      expect(item.attachments?.[0].duration).toBeGreaterThan(0);
      await page.goto(getItemHref(item));
      await expect(page.locator("#allegati audio")).toBeVisible();
      await expect
        .poll(() =>
          page
            .locator("#allegati audio")
            .evaluate((element) => (element as HTMLAudioElement).readyState),
        )
        .toBeGreaterThan(0);
    } finally {
      if (item) await remove(page, item, new URL(baseURL!).origin);
    }
  });
});

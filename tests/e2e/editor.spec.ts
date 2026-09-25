import { getItemHref } from "../../src/domain/item-url";
import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./authenticated";

type FixtureItem = { id: string; title: string };

test.use({ reducedMotion: "reduce" });

test("short document titles stay compact after changing viewport and editor mode", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const title = `Nota ${randomUUID().slice(0, 8)}`;
  const response = await page.request.post("/api/items", {
    headers: { origin },
    data: { type: "RESOURCE", title, content: "Una nota di prova.", inbox: false },
  });
  expect(response.status()).toBe(201);
  const { item } = (await response.json()) as { item: FixtureItem };
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/items/${item.id}`);
    const heading = page.getByRole("textbox", { name: "Titolo", exact: true });
    await expect(heading).toHaveValue(title);
    await page
      .locator("#contenuto")
      .getByRole("button", { name: "Modifica contenuto", exact: true })
      .click();
    await page.getByRole("button", { name: "Anteprima", exact: true }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Scrivi", exact: true }).click();
    await expect
      .poll(async () => (await heading.boundingBox())!.height)
      .toBeLessThanOrEqual(60);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect
      .poll(async () => (await heading.boundingBox())!.width)
      .toBeGreaterThan(700);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(async () => (await heading.boundingBox())!.height)
      .toBeLessThanOrEqual(60);
    await expect(heading).toHaveValue(title);
  } finally {
    const cleanup = await page.request.delete(`/api/items/${item.id}`, {
      headers: { origin },
      data: { confirmTitle: title },
    });
    expect(cleanup.status()).toBe(200);
  }
});

for (const scenario of [
  { label: "desktop, beginning", width: 1440, height: 980, caret: "Home" },
  { label: "mobile, end", width: 390, height: 844, caret: "End" },
] as const) {
  test(`long note autocomplete stays visible and saves a working backlink (${scenario.label})`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    const origin = new URL(baseURL!).origin;
    const suffix = randomUUID().replaceAll("-", "");
    const longContent = Array.from(
      { length: 100 },
      (_, index) =>
        `Paragrafo ${index + 1}. Una nota lunga conserva idee, dettagli e osservazioni. Il collegamento deve rimanere vicino al punto in cui sto scrivendo.`,
    ).join("\n\n");
    const created: FixtureItem[] = [];
    async function create(title: string, content: string) {
      const response = await page.request.post("/api/items", {
        headers: { origin },
        data: { type: "RESOURCE", title, content, inbox: false },
      });
      expect(response.status()).toBe(201);
      const { item } = (await response.json()) as { item: FixtureItem };
      created.push(item);
      return item;
    }

    try {
      const note = await create(`Documento lungo ${suffix}`, longContent);
      const target = await create(`WikiTarget${suffix}`, "La nota collegata.");
      await page.goto(`/items/${note.id}`);
      await page
        .locator("#contenuto")
        .getByRole("button", { name: "Modifica contenuto", exact: true })
        .click();
      const editor = page.getByRole("textbox", {
        name: "Contenuto",
        exact: true,
      });
      await expect(editor).toHaveValue(longContent);
      expect(
        await editor.evaluate((element) => element.scrollHeight),
        "Fixture really exceeds the viewport",
      ).toBeGreaterThan(scenario.height * 3);
      await editor.focus();
      await editor.press(`Control+${scenario.caret}`);
      if (scenario.caret === "End") await page.keyboard.insertText("\n\n");
      await page.keyboard.type(`[[${target.title}`);
      const listbox = page.getByRole("listbox", { name: "Note da collegare" });
      await expect(listbox.getByRole("option")).toHaveCount(2);
      await expect(listbox).toBeVisible();
      await expect(editor).toBeFocused();
      const box = (await listbox.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(scenario.width);
      expect(box.y + box.height).toBeLessThanOrEqual(scenario.height);
      expect(box.height).toBeLessThanOrEqual(240);
      if (scenario.width === 390) {
        const navigation = (await page
          .getByRole("navigation", { name: "Navigazione rapida" })
          .boundingBox())!;
        expect(
          box.y + box.height,
          "Suggestions stay above mobile navigation",
        ).toBeLessThanOrEqual(navigation.y);
      }
      await editor.press("ArrowDown");
      await expect(listbox.getByRole("option").nth(1)).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await editor.press("ArrowUp");
      await expect(
        listbox.getByRole("option", { name: target.title, exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(editor).toBeFocused();
      const screenshot = testInfo.outputPath("long-note-autocomplete.png");
      await page.screenshot({ path: screenshot });
      await testInfo.attach("Autocomplete in a long note", {
        path: screenshot,
        contentType: "image/png",
      });
      await editor.press("Enter");
      await expect(listbox).toHaveCount(0);
      if (scenario.caret === "Home") await page.keyboard.insertText("\n\n");
      const expectedContent =
        scenario.caret === "Home"
          ? `[[${target.title}]]\n\n${longContent}`
          : `${longContent}\n\n[[${target.title}]]`;
      await expect(editor).toHaveValue(expectedContent);
      await expect(editor).toBeFocused();

      const saved = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/items/${note.id}` &&
          response.request().method() === "PATCH",
      );
      await editor.press("Control+s");
      expect((await saved).status()).toBe(200);
      await expect(
        page.getByText("Tutte le modifiche salvate", { exact: true }),
      ).toHaveCount(1);
      const persisted = await page.request.get(`/api/items/${note.id}`);
      expect((await persisted.json()).item.content).toBe(expectedContent);
      const backlink = await page.request.get(`/api/items/${target.id}`);
      expect((await backlink.json()).item.incoming).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            sourceItemId: note.id,
            targetItemId: target.id,
            relationType: "REFERENCES",
            wikilink: true,
          }),
        ]),
      );
      await page
        .getByRole("button", { name: "Anteprima", exact: true })
        .click();
      await page
        .locator(".markdown-preview")
        .getByRole("link", { name: target.title, exact: true })
        .click();
      await expect(page).toHaveURL(getItemHref(target));
      await expect(
        page.getByRole("textbox", { name: "Titolo", exact: true }),
      ).toHaveValue(target.title);
    } finally {
      const cleanup = await Promise.allSettled(
        created.map((item) =>
          page.request.delete(`/api/items/${item.id}`, {
            headers: { origin },
            data: { confirmTitle: item.title },
          }),
        ),
      );
      for (const result of cleanup) {
        expect
          .soft(result.status, "Editor fixture cleanup completes")
          .toBe("fulfilled");
        if (result.status === "fulfilled")
          expect
            .soft(result.value.status(), "Editor fixture removed")
            .toBe(200);
      }
    }
  });
}

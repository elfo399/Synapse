import { randomUUID } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";
import { test as base } from "./authenticated";

type FixtureItem = { id: string; title: string };
type MenuFixture = {
  query: string;
  tag: string;
  note: FixtureItem;
  task: FixtureItem;
};

const test = base.extend<{ menuFixture: MenuFixture }>({
  menuFixture: async ({ page, baseURL }, provideFixture) => {
    const origin = new URL(baseURL!).origin;
    const query = `MenuE2E${randomUUID().replaceAll("-", "")}`;
    const tag = `menutag${randomUUID().replaceAll("-", "")}`;
    const created: FixtureItem[] = [];
    async function create(type: "NOTE" | "TASK", label: string) {
      const response = await page.request.post("/api/items", {
        headers: { origin },
        data: {
          type,
          title: `${query} ${label}`,
          inbox: true,
          tags: type === "NOTE" ? [tag] : [],
        },
      });
      expect(response.status()).toBe(201);
      const { item } = (await response.json()) as { item: FixtureItem };
      created.push(item);
      return item;
    }
    try {
      const note = await create("NOTE", "nota");
      const task = await create("TASK", "attività");
      await provideFixture({ query, tag, note, task });
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
          .soft(result.status, "Fixture cleanup completes")
          .toBe("fulfilled");
        if (result.status === "fulfilled")
          expect.soft(result.value.status(), "Fixture deleted").toBe(200);
      }
    }
  },
});

test.use({ reducedMotion: "reduce" });

async function choose(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function expectSearchLayout(dialog: Locator) {
  const row = dialog.locator(".command-input");
  const field = row.getByRole("combobox");
  await expect(field).toBeVisible();
  const [dialogBox, rowBox, fieldBox, iconBox] = await Promise.all([
    dialog.boundingBox(),
    row.boundingBox(),
    field.boundingBox(),
    row.locator("svg").first().boundingBox(),
  ]);
  expect(rowBox!.width, "Search spans the dialog").toBeGreaterThan(
    dialogBox!.width * 0.8,
  );
  expect(fieldBox!.width, "Input fills the search row").toBeGreaterThan(
    rowBox!.width * 0.7,
  );
  expect(fieldBox!.x, "Icon and input are side by side").toBeGreaterThanOrEqual(
    iconBox!.x + iconBox!.width,
  );
  expect(
    Math.abs(
      iconBox!.y + iconBox!.height / 2 - fieldBox!.y - fieldBox!.height / 2,
    ),
    "Icon is vertically aligned",
  ).toBeLessThan(3);
}

test("search uses the full dialog width and supports keyboard navigation and focus restoration", async ({
  page,
  menuFixture,
}) => {
  await page.goto("/inbox");
  const trigger = page
    .locator(".topbar")
    .getByRole("button", { name: "Cerca", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Cerca in Synapse" });
  const input = dialog.getByRole("combobox", {
    name: "Cerca nelle tue conoscenze",
  });
  await expect(input).toBeFocused();
  await expectSearchLayout(dialog);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await input.fill(menuFixture.query);
  const results = dialog.getByRole("option");
  await expect(results).toHaveCount(2);
  await expect(results.first()).toHaveAttribute("aria-selected", "true");
  const secondResultId = (await results.nth(1).getAttribute("id"))!.replace(
    /^search-/,
    "",
  );
  expect([menuFixture.note.id, menuFixture.task.id]).toContain(secondResultId);
  await input.press("ArrowDown");
  await expect(results.nth(1)).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expect(page).toHaveURL(`/items/${secondResultId}`);
  await expect(dialog).toHaveCount(0);
});

test("type filter sends the API value and clearing it restores all types", async ({
  page,
  menuFixture,
}) => {
  await page.goto("/inbox");
  await page
    .getByRole("textbox", { name: "Filtra gli elementi" })
    .fill(menuFixture.query);
  const note = page.getByRole("link", {
    name: new RegExp(menuFixture.note.title),
  });
  const task = page.getByRole("link", {
    name: new RegExp(menuFixture.task.title),
  });
  await expect(note).toBeVisible();
  await expect(task).toBeVisible();
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/items" &&
      url.searchParams.get("q") === menuFixture.query &&
      url.searchParams.get("type") === "TASK"
    );
  });
  await choose(page, "Filtra per tipo", "Attività");
  expect((await filtered).status()).toBe(200);
  await expect(note).toHaveCount(0);
  await expect(task).toBeVisible();
  const cleared = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname === "/api/items" &&
      url.searchParams.get("q") === menuFixture.query &&
      !url.searchParams.has("type")
    );
  });
  await choose(page, "Filtra per tipo", "Tutti i tipi");
  expect((await cleared).status()).toBe(200);
  await expect(note).toBeVisible();
  await expect(task).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Filtra per tipo", exact: true }),
  ).toHaveText("Tutti i tipi");
});

test("nested capture menu preserves dialog focus and item menus save type and status", async ({
  page,
  menuFixture,
}) => {
  await page.goto("/inbox");
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Annota", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Annotazione rapida" });
  await dialog.getByRole("button", { name: "Dettagli", exact: true }).click();
  await choose(page, "Tipo", "Preferito");
  await expect(
    dialog.getByRole("textbox", { name: "URL", exact: true }),
  ).toBeVisible();
  const type = dialog.getByRole("combobox", { name: "Tipo", exact: true });
  await type.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(type).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  await page.goto(`/items/${menuFixture.note.id}`);
  await choose(page, "Tipo di elemento", "Attività");
  await choose(page, "Stato", "In corso");
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        `/api/items/${menuFixture.note.id}` &&
      response.request().method() === "PATCH",
  );
  await page
    .getByRole("button", { name: "Salva modifiche", exact: true })
    .click();
  expect((await saved).status()).toBe(200);
  await expect(
    page.getByText("Tutte le modifiche salvate", { exact: true }),
  ).toBeVisible();
  const persisted = await page.request.get(`/api/items/${menuFixture.note.id}`);
  expect((await persisted.json()).item).toMatchObject({
    type: "TASK",
    status: "IN_PROGRESS",
  });
});

test("search and nested select stay inside a narrow mobile viewport", async ({
  page,
  menuFixture,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/inbox");
  await page
    .locator(".topbar")
    .getByRole("button", { name: "Cerca", exact: true })
    .click();
  const search = page.getByRole("dialog", { name: "Cerca in Synapse" });
  await search.getByRole("combobox").fill(menuFixture.query);
  await expect(search.getByRole("option")).toHaveCount(2);
  await expectSearchLayout(search);
  let box = (await search.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "Navigazione rapida" })
    .getByRole("button", { name: "Annotazione rapida", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Dettagli", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Tipo", exact: true }).click();
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible();
  box = (await listbox.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.getByRole("option", { name: "Preferito", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "URL", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
});

test("command palette opens real actions and finds tagged knowledge with the keyboard", async ({
  page,
  menuFixture,
}) => {
  await page.goto("/");
  await page.keyboard.press("Control+k");
  const palette = page.getByRole("dialog", { name: "Cerca in Synapse" });
  const input = palette.getByRole("combobox");
  await input.fill(">Nuova nota");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await input.press("Enter");
  const capture = page.getByRole("dialog", { name: "Nuova nota", exact: true });
  await expect(
    capture.getByRole("textbox", { name: "Titolo", exact: true }),
  ).toBeFocused();
  await expect(
    capture.getByRole("combobox", { name: "Tipo", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await input.fill(`#${menuFixture.tag}`);
  await expect(palette.getByRole("option")).toHaveCount(1);
  await input.press("Enter");
  await expect(page).toHaveURL(`/tags?tag=${menuFixture.tag}`);
  await expect(
    page.getByRole("link", { name: new RegExp(menuFixture.note.title) }),
  ).toBeVisible();
});

test("mobile navigation traps focus and workspace preferences persist", async ({
  page,
  menuFixture,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/items/${menuFixture.note.id}`);
  await page
    .getByRole("navigation", { name: "Navigazione rapida" })
    .getByRole("button", { name: "Altro", exact: true })
    .click();
  const drawer = page.getByRole("dialog", { name: "Synapse", exact: true });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect
    .poll(() =>
      drawer.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await drawer.getByRole("link", { name: "Note", exact: true }).click();
  await expect(page).toHaveURL("/notes");
  await expect(drawer).toHaveCount(0);
  for (const action of ["search", "capture"] as const) {
    await page
      .getByRole("button", { name: "Apri il menu", exact: true })
      .click();
    if (action === "search") await drawer.locator(".sidebar-search").click();
    else
      await drawer
        .getByRole("button", { name: "Annotazione rapida", exact: true })
        .click();
    const activeDialog = page.getByRole("dialog");
    await expect(activeDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(activeDialog).toHaveCount(0);
    await expect(page.locator("#main-content")).toBeFocused();
  }
  await page.getByRole("button", { name: "Apri il menu", exact: true }).click();
  await drawer.getByRole("button", { name: "Preferenze", exact: true }).click();
  const preferences = page.getByRole("dialog", {
    name: "Preferenze",
    exact: true,
  });
  await preferences.getByRole("checkbox", { name: "Liste compatte" }).check();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.locator(".workspace")).toHaveAttribute(
    "data-density",
    "compact",
  );
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

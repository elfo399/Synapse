import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test as base } from "./authenticated";

type FixtureItem = { id: string; title: string };
type GraphFixture = {
  path: string;
  note: FixtureItem;
  otherNote: FixtureItem;
  task: FixtureItem;
};

const test = base.extend<{ graphFixture: GraphFixture }>({
  graphFixture: async ({ page, baseURL }, provideFixture) => {
    const origin = new URL(baseURL!).origin;
    const prefix = `Graph E2E ${randomUUID()}`;
    const created: FixtureItem[] = [];
    async function create(
      label: string,
      type: "PROJECT" | "RESOURCE" | "TASK",
      parentIds: string[] = [],
    ) {
      const response = await page.request.post("/api/items", {
        headers: { origin },
        data: { title: `${prefix} ${label}`, type, inbox: false, parentIds },
      });
      expect(response.status(), `Create isolated graph ${label}`).toBe(201);
      const { item } = (await response.json()) as { item: FixtureItem };
      created.push(item);
      return item;
    }
    try {
      const project = await create("project", "PROJECT");
      const note = await create("first note", "RESOURCE", [project.id]);
      const otherNote = await create("second note", "RESOURCE", [project.id]);
      const task = await create("task", "TASK", [project.id]);
      await provideFixture({
        path: `/graph?focus=${encodeURIComponent(project.id)}`,
        note,
        otherNote,
        task,
      });
    } finally {
      // Delete only this test's returned IDs, even when setup or browser assertions fail.
      const cleanup = await Promise.allSettled(
        created.map((item) =>
          page.request.delete(`/api/items/${item.id}`, {
            headers: { origin },
            data: { confirmed: true },
          }),
        ),
      );
      for (const result of cleanup) {
        expect
          .soft(result.status, "Graph fixture cleanup request completes")
          .toBe("fulfilled");
        if (result.status === "fulfilled")
          expect
            .soft(result.value.status(), "Graph fixture item deleted")
            .toBe(200);
      }
    }
  },
});

test.use({
  reducedMotion: "reduce",
  launchOptions: {
    args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  },
});

test("3D graph orbits, zooms, preserves selection and filters, and switches to 2D", async ({
  page,
  graphFixture,
}) => {
  await page.goto(graphFixture.path);
  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toHaveAttribute("data-mode", "3d");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(canvas).toHaveAttribute("data-settled", "true");
  await expect(canvas.locator("canvas")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-camera-position", /\S/);
  await expect(page.locator(".graph-stage-label")).toContainText("4 nodi");
  await expect(page.locator(".graph-stage-label")).toContainText(
    "3 collegamenti",
  );

  let position = await canvas.getAttribute("data-camera-position");
  await page
    .getByRole("button", { name: "Ruota a destra", exact: true })
    .click();
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, {
    steps: 12,
  });
  await page.mouse.up();
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  await page
    .getByRole("group", {
      name: "Grafo interattivo delle conoscenze",
      exact: true,
    })
    .focus();
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("button", { name: "Riduci", exact: true }).click();
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(position);
  position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await expect
    .poll(() => canvas.getAttribute("data-camera-position"))
    .not.toBe(position);
  await page
    .getByRole("button", { name: "Adatta il grafo alla vista" })
    .click();

  await page
    .getByText("Esplora i nodi con la tastiera", { exact: false })
    .click();
  const nodeBrowser = page.locator(".graph-node-browser");
  await expect(nodeBrowser.getByRole("button")).toHaveCount(4);
  const title = graphFixture.note.title;
  const node = nodeBrowser.getByRole("button", { name: title, exact: true });
  await node.click();
  await expect(
    page
      .getByRole("complementary", { name: "Elemento selezionato" })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(
    page
      .getByRole("complementary", { name: "Elemento selezionato" })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await page.locator(".graph-filter-menu summary").click();
  await page
    .getByRole("combobox", { name: "Filtra per tipo di elemento", exact: true })
    .click();
  await page.getByRole("option", { name: "Nota", exact: true }).click();
  await expect(nodeBrowser.getByRole("button")).toHaveCount(2);
  await expect(
    nodeBrowser.getByRole("button", { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    nodeBrowser.getByRole("button", {
      name: graphFixture.otherNote.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    nodeBrowser.getByRole("button", {
      name: graphFixture.task.title,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator(".graph-stage-label")).toContainText("2 nodi");
  await expect(page.locator(".graph-stage-label")).toContainText(
    "0 collegamenti",
  );
  await expect(
    page
      .getByRole("complementary", { name: "Elemento selezionato" })
      .getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", "3d");
});

test("WebGL failure keeps the graph usable in 2D", async ({
  page,
  graphFixture,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      ...args: Parameters<typeof original>
    ) {
      if (
        String(args[0]).startsWith("webgl") ||
        args[0] === "experimental-webgl"
      )
        return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto(graphFixture.path);
  await expect(
    page.getByRole("status").filter({ hasText: "Il 3D non è disponibile" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "2D", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByTestId("graph-canvas").locator("canvas").first(),
  ).toBeVisible();
  await page
    .getByText("Esplora i nodi con la tastiera", { exact: false })
    .click();
  await page
    .locator(".graph-node-browser")
    .getByRole("button", { name: graphFixture.note.title, exact: true })
    .click();
  await expect(
    page
      .getByRole("complementary", { name: "Elemento selezionato" })
      .getByRole("heading", { name: graphFixture.note.title, exact: true }),
  ).toBeVisible();
});

test("local depth, contextual inspector, fullscreen filters and mobile bounds", async ({
  page,
  graphFixture,
}) => {
  await page.goto(
    `/graph?focus=${encodeURIComponent(graphFixture.note.id)}&depth=1`,
  );
  await expect(page.locator(".graph-stage-label")).toContainText("2 nodi");
  await page.getByRole("button", { name: "Profondità 2", exact: true }).click();
  await expect(page).toHaveURL(/depth=2/);
  await expect(page.locator(".graph-stage-label")).toContainText("4 nodi");
  await page.getByRole("button", { name: "Profondità 3", exact: true }).click();
  await expect(page).toHaveURL(/depth=3/);
  await expect(page.locator(".graph-stage-label")).toContainText("4 nodi");
  const before = (await page.locator(".graph-stage").boundingBox())!;
  await page
    .getByRole("button", {
      name: "Chiudi i dettagli dell’elemento",
      exact: true,
    })
    .click();
  await expect(page.locator(".graph-details")).toHaveCount(0);
  await expect(page.locator(".graph-stage")).toBeFocused();
  expect(
    (await page.locator(".graph-stage").boundingBox())!.width,
  ).toBeGreaterThan(before.width + 250);

  await page
    .getByRole("button", { name: "Schermo intero", exact: true })
    .click();
  await expect(page.locator(".graph-page")).toHaveClass(/graph-expanded/);
  await page.locator(".graph-filter-menu summary").click();
  await page
    .getByRole("combobox", { name: "Filtra per tipo di elemento", exact: true })
    .click();
  const option = page.getByRole("option", { name: "Nota", exact: true });
  await expect(option).toBeVisible();
  // A portaled menu must remain above the expanded graph, and Escape only
  // dismisses that menu before dismissing its containing filter popover.
  await option.click();
  await expect(page.locator(".graph-stage-label")).toContainText("2 nodi");
  await page
    .getByRole("combobox", { name: "Filtra per tipo di elemento", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator(".graph-filter-menu")).toHaveAttribute("open", "");
  await page.keyboard.press("Escape");
  await expect(page.locator(".graph-filter-menu")).not.toHaveAttribute(
    "open",
    "",
  );
  await page
    .getByRole("button", { name: "Esci da schermo intero", exact: true })
    .click();
  await expect(page.locator(".graph-page")).not.toHaveClass(/graph-expanded/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Globale", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Locale", exact: true }),
  ).toBeDisabled();
  await page.locator(".graph-node-browser summary").click();
  await page
    .locator(".graph-node-browser")
    .getByRole("button", { name: graphFixture.note.title, exact: true })
    .click();
  await page.locator(".graph-node-browser summary").click();
  await expect(page.locator(".graph-details h2")).toHaveText(
    graphFixture.note.title,
  );
  const panel = (await page.locator(".graph-details").boundingBox())!;
  const stage = (await page.locator(".graph-stage").boundingBox())!;
  expect(panel.y).toBeGreaterThanOrEqual(stage.y + stage.height - 1);
  expect(panel.x + panel.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
});

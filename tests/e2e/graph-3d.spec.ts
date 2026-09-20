import { randomUUID } from "node:crypto";
import { expect, test as base, type Page } from "@playwright/test";

type FixtureItem = { id: string; title: string };
type GraphFixture = { path: string; note: FixtureItem; otherNote: FixtureItem; task: FixtureItem };

async function signIn(page: Page, origin: string) {
  // UI sign-in is covered by workspace.spec.ts; this context shares the session with the browser.
  const response = await page.request.post("/api/auth/sign-in/email", {
    headers: { origin },
    data: { email: process.env.INITIAL_ADMIN_EMAIL!, password: process.env.INITIAL_ADMIN_PASSWORD! },
  });
  expect(response.status(), "Graph fixture sign-in succeeds").toBe(200);
}

const test = base.extend<{ graphFixture: GraphFixture }>({
  graphFixture: async ({ page, baseURL }, provideFixture) => {
    const origin = new URL(baseURL!).origin;
    await signIn(page, origin);
    const prefix = `Graph E2E ${randomUUID()}`;
    const created: FixtureItem[] = [];
    async function create(label: string, type: "PROJECT" | "NOTE" | "TASK", parentIds: string[] = []) {
      const response = await page.request.post("/api/items", {
        headers: { origin },
        data: { title: `${prefix} ${label}`, type, inbox: false, parentIds },
      });
      expect(response.status(), `Create isolated graph ${label}`).toBe(201);
      const { item } = await response.json() as { item: FixtureItem };
      created.push(item);
      return item;
    }
    try {
      const project = await create("project", "PROJECT");
      const note = await create("first note", "NOTE", [project.id]);
      const otherNote = await create("second note", "NOTE", [project.id]);
      const task = await create("task", "TASK", [project.id]);
      await provideFixture({ path: `/graph?focus=${encodeURIComponent(project.id)}`, note, otherNote, task });
    } finally {
      // Delete only this test's returned IDs, even when setup or browser assertions fail.
      const cleanup = await Promise.allSettled(created.map(item => page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmTitle: item.title },
      })));
      for (const result of cleanup) {
        expect.soft(result.status, "Graph fixture cleanup request completes").toBe("fulfilled");
        if (result.status === "fulfilled") expect.soft(result.value.status(), "Graph fixture item deleted").toBe(200);
      }
    }
  },
});

test.use({ reducedMotion: "reduce", launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] } });

test("3D graph orbits, zooms, preserves selection and filters, and switches to 2D", async ({ page, graphFixture }) => {
  await page.goto(graphFixture.path);
  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toHaveAttribute("data-mode", "3d");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(canvas).toHaveAttribute("data-settled", "true");
  await expect(canvas.locator("canvas")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-camera-position", /\S/);
  await expect(page.locator(".graph-stage-label")).toContainText("4 nodi");
  await expect(page.locator(".graph-stage-label")).toContainText("3 collegamenti");

  let position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("button", { name: "Ruota a destra", exact: true }).click();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .35, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .55, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("group", { name: "Grafo interattivo delle conoscenze", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(position);

  position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("button", { name: "Riduci", exact: true }).click();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(position);
  position = await canvas.getAttribute("data-camera-position");
  await page.getByRole("button", { name: "Ingrandisci", exact: true }).click();
  await expect.poll(() => canvas.getAttribute("data-camera-position")).not.toBe(position);
  await page.getByRole("button", { name: "Adatta il grafo alla vista" }).click();

  await page.getByText("Esplora i nodi con la tastiera", { exact: false }).click();
  const nodeBrowser = page.locator(".graph-node-browser");
  await expect(nodeBrowser.getByRole("button")).toHaveCount(4);
  const title = graphFixture.note.title;
  const node = nodeBrowser.getByRole("button", { name: title, exact: true });
  await node.click();
  await expect(page.getByRole("complementary", { name: "Elemento selezionato" }).getByRole("heading", { name: title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByRole("button", { name: "2D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Elemento selezionato" }).getByRole("heading", { name: title, exact: true })).toBeVisible();

  await page.getByRole("button", { name: "3D", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await page.getByLabel("Filtra per tipo di elemento", { exact: true }).selectOption("NOTE");
  await expect(nodeBrowser.getByRole("button")).toHaveCount(2);
  await expect(nodeBrowser.getByRole("button", { name: title, exact: true })).toBeVisible();
  await expect(nodeBrowser.getByRole("button", { name: graphFixture.otherNote.title, exact: true })).toBeVisible();
  await expect(nodeBrowser.getByRole("button", { name: graphFixture.task.title, exact: true })).toHaveCount(0);
  await expect(page.locator(".graph-stage-label")).toContainText("2 nodi");
  await expect(page.locator(".graph-stage-label")).toContainText("0 collegamenti");
  await expect(page.getByRole("complementary", { name: "Elemento selezionato" }).getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(canvas).toHaveAttribute("data-mode", "3d");
});

test("WebGL failure keeps the graph usable in 2D", async ({ page, graphFixture }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (String(args[0]).startsWith("webgl") || args[0] === "experimental-webgl") return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto(graphFixture.path);
  await expect(page.getByRole("status").filter({ hasText: "Il 3D non è disponibile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "2D", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();
  await page.getByText("Esplora i nodi con la tastiera", { exact: false }).click();
  await page.locator(".graph-node-browser").getByRole("button", { name: graphFixture.note.title, exact: true }).click();
  await expect(page.getByRole("complementary", { name: "Elemento selezionato" }).getByRole("heading", { name: graphFixture.note.title, exact: true })).toBeVisible();
});

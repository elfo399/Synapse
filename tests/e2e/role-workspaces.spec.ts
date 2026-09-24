import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { test } from "./authenticated";
import { getItemHref } from "../../src/domain/item-url";
import type { ItemDetail } from "../../src/domain/types";

type Created = ItemDetail;

test("area, project and resource have dedicated workspaces and contextual actions", async ({
  page,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const suffix = randomUUID().slice(0, 8);
  const created: Created[] = [];
  async function create(data: Record<string, unknown>) {
    const response = await page.request.post("/api/items", {
      headers: { origin },
      data,
    });
    expect(response.status()).toBe(201);
    const item = (await response.json()).item as Created;
    created.push(item);
    return item;
  }
  async function contextualCreate(button: string, title: string) {
    await page
      .getByRole("button", { name: button, exact: true })
      .filter({ has: page.locator("svg") })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titolo", { exact: true }).fill(title);
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/capture" &&
        response.request().method() === "POST",
    );
    await dialog
      .getByRole("button", { name: "Crea elemento", exact: true })
      .click();
    const response = await saved;
    expect(response.status()).toBe(201);
    const item = (await response.json()).item as Created;
    created.push(item);
    return item;
  }
  try {
    const area = await create({
      title: `Area UI ${suffix}`,
      type: "AREA",
      inbox: false,
    });
    const project = await create({
      title: `Progetto UI ${suffix}`,
      type: "PROJECT",
      inbox: false,
      parentIds: [area.id],
    });
    const resource = await create({
      title: `Risorsa UI ${suffix}`,
      type: "RESOURCE",
      inbox: false,
      parentIds: [project.id],
    });

    await page.goto(getItemHref(area));
    await expect(
      page.getByRole("heading", {
        name: `Tutto ciò che riguarda ${area.title}`,
      }),
    ).toBeVisible();
    await expect(
      page
        .locator(".area-workspace")
        .getByRole("heading", { name: /^Progetti/ }),
    ).toBeVisible();
    const areaShot = testInfo.outputPath("area-workspace.png");
    await page.screenshot({ path: areaShot, fullPage: true });
    await testInfo.attach("Area workspace", {
      path: areaShot,
      contentType: "image/png",
    });
    const areaProject = `Progetto contestuale ${suffix}`;
    await contextualCreate("Nuovo progetto", areaProject);
    const areaChildren = await page.request.get(
      `/api/items?parent=${area.id}&type=PROJECT`,
    );
    expect(
      (await areaChildren.json()).items.map((item: Created) => item.title),
    ).toContain(areaProject);

    await page.goto(getItemHref(project));
    await expect(
      page.getByRole("heading", { name: "Avanzamento e prossimi passi" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Da fare" })).toBeVisible();
    const projectShot = testInfo.outputPath("project-workspace.png");
    await page.screenshot({ path: projectShot, fullPage: true });
    await testInfo.attach("Project workspace", {
      path: projectShot,
      contentType: "image/png",
    });
    const taskTitle = `Attività contestuale ${suffix}`;
    await contextualCreate("Nuova attività", taskTitle);
    const taskChildren = await page.request.get(
      `/api/items?parent=${project.id}&type=TASK`,
    );
    expect(
      (await taskChildren.json()).items.map((item: Created) => item.title),
    ).toContain(taskTitle);

    await page.goto(getItemHref(resource));
    await expect(
      page.getByRole("heading", { name: "Contenuti" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Immagine", exact: true }),
    ).toBeVisible();
    const resourceShot = testInfo.outputPath("resource-workspace.png");
    await page.screenshot({ path: resourceShot, fullPage: true });
    await testInfo.attach("Resource workspace", {
      path: resourceShot,
      contentType: "image/png",
    });
    const noteTitle = `Nota contestuale ${suffix}`;
    await contextualCreate("Nuova nota", noteTitle);
    const noteChildren = await page.request.get(
      `/api/items?parent=${resource.id}&type=NOTE`,
    );
    expect(
      (await noteChildren.json()).items.map((item: Created) => item.title),
    ).toContain(noteTitle);
    await page
      .locator(".resource-contents")
      .locator('input[accept="image/jpeg,image/png,image/webp,image/gif"]')
      .setInputFiles({
        name: "risorsa.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await expect(page.getByText("risorsa.png", { exact: true })).toBeVisible();
  } finally {
    for (const item of [...created].reverse()) {
      await page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmTitle: item.title },
      });
    }
  }
});

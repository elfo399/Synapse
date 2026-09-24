import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { expect } from "@playwright/test";
import { unzipSync } from "fflate";
import { test } from "./authenticated";
import { getItemHref } from "../../src/domain/item-url";
import type { ItemDetail } from "../../src/domain/types";

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1)
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, payload: Buffer) {
  const chunk = Buffer.alloc(payload.length + 12);
  const kind = Buffer.from(type, "ascii");
  chunk.writeUInt32BE(payload.length, 0);
  kind.copy(chunk, 4);
  payload.copy(chunk, 8);
  chunk.writeUInt32BE(
    crc32(Buffer.concat([kind, payload])),
    payload.length + 8,
  );
  return chunk;
}

function verticalPng() {
  const width = 24;
  const height = 1_200;
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (width * 4 + 1);
    for (let x = 0; x < width; x += 1) {
      const pixel = offset + 1 + x * 4;
      scanlines[pixel] = 112;
      scanlines[pixel + 1] = 87;
      scanlines[pixel + 2] = 194;
      scanlines[pixel + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(scanlines)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function wavFile() {
  const wav = Buffer.alloc(48);
  wav.write("RIFF", 0, 4, "ascii");
  wav.writeUInt32LE(40, 4);
  wav.write("WAVEfmt ", 8, 8, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24);
  wav.writeUInt32LE(16_000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, 4, "ascii");
  wav.writeUInt32LE(4, 40);
  return wav;
}

test("export dialog lets the user choose a native or readable ZIP", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const suffix = randomUUID().slice(0, 8);
  const response = await page.request.post("/api/items", {
    headers: { origin },
    data: {
      title: `Risorsa export UI ${suffix}`,
      type: "RESOURCE",
      inbox: false,
    },
  });
  expect(response.status()).toBe(201);
  const item = (await response.json()).item as ItemDetail;
  try {
    await page.goto(getItemHref(item));
    await page.getByRole("button", { name: "Esporta", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByText("Archivio Synapse", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Formato leggibile", { exact: true }),
    ).toBeVisible();
    await expect(
      dialog.getByText("Reimportabile in Synapse", { exact: true }),
    ).toBeVisible();
    const nativeLink = dialog
      .locator("a.export-format-option")
      .filter({ hasText: "Archivio Synapse" });
    const readableLink = dialog
      .locator("a.export-format-option")
      .filter({ hasText: "Formato leggibile" });
    await expect(nativeLink).toHaveAttribute(
      "href",
      new RegExp(`/api/items/${item.id}/export$`),
    );
    await expect(readableLink).toHaveAttribute(
      "href",
      new RegExp(`/api/items/${item.id}/export\\?format=readable$`),
    );
    const screenshot = test.info().outputPath("export-format-choice.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    await test.info().attach("Scelta formato esportazione", {
      path: screenshot,
      contentType: "image/png",
    });
  } finally {
    await page.request.delete(`/api/items/${item.id}`, {
      headers: { origin },
      data: { confirmTitle: item.title },
    });
  }
});

test("native export reimports while the readable ZIP stays offline and linked", async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const suffix = randomUUID().slice(0, 8);
  const created: ItemDetail[] = [];
  const create = async (data: Record<string, unknown>) => {
    const response = await page.request.post("/api/items", {
      headers: { origin },
      data,
    });
    expect(response.status()).toBe(201);
    const item = (await response.json()).item as ItemDetail;
    created.push(item);
    return item;
  };
  try {
    const area = await create({
      title: `Trasferimento Area ${suffix}`,
      type: "AREA",
      inbox: false,
    });
    const project = await create({
      title: `Trasferimento Progetto ${suffix}`,
      type: "PROJECT",
      inbox: false,
      parentIds: [area.id],
    });
    const resource = await create({
      title: `Trasferimento Risorsa ${suffix}`,
      type: "RESOURCE",
      inbox: false,
      parentIds: [project.id],
    });
    await create({
      title: `Trasferimento Attività ${suffix}`,
      type: "TASK",
      inbox: false,
      status: "TODO",
      dueAt: "2026-10-01T12:00:00.000Z",
      parentIds: [project.id],
    });
    const image = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      "base64",
    );
    const upload = await page.request.post(
      `/api/items/${resource.id}/attachments`,
      {
        headers: { origin },
        multipart: {
          payload: "{}",
          files: { name: "offline.png", mimeType: "image/png", buffer: image },
        },
      },
    );
    expect(upload.status()).toBe(201);
    const attachment = ((await upload.json()).item as ItemDetail)
      .attachments?.[0];
    expect(attachment).toBeTruthy();
    for (const block of [
      { type: "TEXT", text: "# Contenuto offline" },
      { type: "IMAGE", attachmentId: attachment!.id },
      { type: "LINK", url: "https://example.com" },
    ]) {
      const result = await page.request.post(
        `/api/items/${resource.id}/blocks`,
        { headers: { origin }, data: block },
      );
      expect(result.status()).toBe(201);
    }
    const nativeResponse = await page.request.get(
      `/api/items/${area.id}/export`,
    );
    expect(nativeResponse.status()).toBe(200);
    const native = await nativeResponse.body();
    const nativeEntries = unzipSync(native);
    expect(Object.keys(nativeEntries)).toEqual(
      expect.arrayContaining(["manifest.json", "items.json", "relations.json"]),
    );
    const imported = await page.request.post("/api/import", {
      headers: { origin },
      multipart: {
        file: {
          name: "archivio-synapse.zip",
          mimeType: "application/zip",
          buffer: native,
        },
      },
    });
    expect(imported.status()).toBe(201);
    const readableResponse = await page.request.get(
      `/api/items/${area.id}/export?format=readable`,
    );
    expect(readableResponse.status()).toBe(200);
    const readable = await readableResponse.body();
    const readableEntries = unzipSync(readable);
    const names = Object.keys(readableEntries);
    expect(names).toContain("index.html");
    expect(names.some((name) => name.endsWith(".md"))).toBe(true);
    expect(
      names.some((name) => name.startsWith("assets/") && name.endsWith(".png")),
    ).toBe(true);
    const markdown = names.find((name) => name.endsWith(".md"))!;
    expect(new TextDecoder().decode(readableEntries[markdown])).toMatch(
      /\]\((\.\.\/)+assets\//,
    );
    const rejected = await page.request.post("/api/import", {
      headers: { origin },
      multipart: {
        file: {
          name: "raccolta-legibile.zip",
          mimeType: "application/zip",
          buffer: readable,
        },
      },
    });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).error).toContain("formato leggibile");
  } finally {
    for (const item of [...created].reverse()) {
      await page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmTitle: item.title },
      });
    }
  }
});

test("readable export is an offline document with fitted media and resolved wikilinks", async ({
  page,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  const suffix = randomUUID().slice(0, 8);
  const created: ItemDetail[] = [];
  const create = async (data: Record<string, unknown>) => {
    const response = await page.request.post("/api/items", {
      headers: { origin },
      data,
    });
    expect(response.status()).toBe(201);
    const item = (await response.json()).item as ItemDetail;
    created.push(item);
    return item;
  };
  try {
    const project = await create({
      title: `Raccolta offline ${suffix}`,
      type: "PROJECT",
      inbox: false,
    });
    await create({
      title: `Risorsa collegata ${suffix}`,
      type: "RESOURCE",
      inbox: false,
      parentIds: [project.id],
    });
    const resource = await create({
      title: `Documento multimediale ${suffix}`,
      type: "RESOURCE",
      inbox: false,
      parentIds: [project.id],
    });
    const upload = async (name: string, mimeType: string, buffer: Buffer) => {
      const response = await page.request.post(
        `/api/items/${resource.id}/attachments`,
        {
          headers: { origin },
          multipart: {
            payload: "{}",
            files: { name, mimeType, buffer },
          },
        },
      );
      expect(response.status()).toBe(201);
      const item = (await response.json()).item as ItemDetail;
      const attachment = item.attachments?.find(
        (candidate) => candidate.originalName === name,
      );
      expect(attachment).toBeTruthy();
      return attachment!;
    };
    const image = await upload("verticale.png", "image/png", verticalPng());
    const audio = await upload("nota.wav", "audio/wav", wavFile());
    const pdf = await upload(
      "documento.pdf",
      "application/pdf",
      Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"),
    );
    const blocks = [
      {
        type: "TEXT",
        text: `# Documento consultabile\n\n> Questa è una citazione Markdown.\n\nVai a [[Risorsa collegata ${suffix}]].\n\n| Tipo | Stato |\n| --- | --- |\n| Archivio | Pronto |\n\n\`\`\`ts\nconst offline = true;\n\`\`\``,
      },
      { type: "IMAGE", attachmentId: image.id },
      { type: "AUDIO", attachmentId: audio.id },
      { type: "FILE", attachmentId: pdf.id },
    ];
    for (const block of blocks) {
      const result = await page.request.post(
        `/api/items/${resource.id}/blocks`,
        {
          headers: { origin },
          data: block,
        },
      );
      expect(result.status()).toBe(201);
    }
    const response = await page.request.get(
      `/api/items/${project.id}/export?format=readable`,
    );
    expect(response.status()).toBe(200);
    const entries = unzipSync(await response.body());
    const names = Object.keys(entries);
    const sourcePage = names.find(
      (name) =>
        name.endsWith(".html") &&
        new TextDecoder()
          .decode(entries[name])
          .includes("Documento consultabile"),
    );
    expect(sourcePage).toBeTruthy();
    expect(new TextDecoder().decode(entries["README.txt"])).toContain(
      "Estrai completamente lo ZIP",
    );
    const outputDirectory = testInfo.outputPath("readable-offline");
    await mkdir(outputDirectory, { recursive: true });
    await Promise.all(
      names.map(async (name) => {
        const targetPath = path.join(outputDirectory, ...name.split("/"));
        await mkdir(path.dirname(targetPath), { recursive: true });
        await writeFile(targetPath, entries[name]);
      }),
    );
    const sourceHtml = new TextDecoder().decode(entries[sourcePage!]);
    expect(sourceHtml).toContain("<blockquote>");
    expect(sourceHtml).toContain("<table>");
    expect(sourceHtml).toContain("<pre>");
    expect(sourceHtml).not.toContain("[[Risorsa collegata");
    const targetPage = names.find((name) =>
      new TextDecoder()
        .decode(entries[name])
        .includes(`<h1>Risorsa collegata ${suffix}</h1>`),
    );
    expect(targetPage).toBeTruthy();
    const wikiHref = sourceHtml.match(
      new RegExp(`href="([^"]*)">Risorsa collegata ${suffix}`),
    )?.[1];
    expect(wikiHref).toBeTruthy();
    expect(
      path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePage!), wikiHref!),
      ),
    ).toBe(targetPage);
    for (const reference of sourceHtml.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const href = reference[1];
      if (!href.startsWith("assets/") && !href.includes("/assets/")) continue;
      const assetPath = path.posix.normalize(
        path.posix.join(path.posix.dirname(sourcePage!), href),
      );
      expect(names).toContain(assetPath);
    }
    await page.goto(
      pathToFileURL(path.join(outputDirectory, ...sourcePage!.split("/"))).href,
    );
    await expect(
      page.getByText("Questa è una citazione Markdown."),
    ).toBeVisible();
    await expect(page.locator("audio")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "documento.pdf" }),
    ).toBeVisible();
    const imageBox = await page.locator("img").boundingBox();
    expect(imageBox?.height).toBeLessThanOrEqual(420);
    expect(
      await page
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalHeight),
    ).toBe(1_200);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const screenshot = testInfo.outputPath("readable-offline-document.png");
    await page.screenshot({ path: screenshot, fullPage: true });
    await testInfo.attach("Documento leggibile offline", {
      path: screenshot,
      contentType: "image/png",
    });
  } finally {
    for (const item of [...created].reverse()) {
      await page.request.delete(`/api/items/${item.id}`, {
        headers: { origin },
        data: { confirmTitle: item.title },
      });
    }
  }
});

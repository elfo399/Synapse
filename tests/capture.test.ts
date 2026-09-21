import { describe, expect, it } from "vitest";
import { getItemHref, getItemId } from "@/domain/item-url";
import { captureTitle, captureUrl } from "@/domain/attachments";
import { safeFilename, validateUpload } from "@/server/upload-validation";
import { LocalFilesystemStorage } from "@/server/storage";

describe("Stable readable item URLs", () => {
  it("uses the ID regardless of a title rename or old URL", () => {
    const href = getItemHref({
      id: "cmuid123",
      title: "Caffè & backup / 2026",
    });
    expect(href).toBe("/items/caffe-backup-2026--cmuid123");
    expect(getItemId(href.split("/").pop()!)).toBe("cmuid123");
    expect(getItemId("cmuid123")).toBe("cmuid123");
    expect(getItemId("nome-precedente--cmuid123")).toBe("cmuid123");
    expect(getItemHref({ id: "cmuid123", title: "😀" })).toBe(
      "/items/elemento--cmuid123",
    );
  });
});
describe("Capture validation", () => {
  it("derives readable deterministic titles and recognizes only complete HTTP URLs", () => {
    expect(captureTitle("# Appunti\nUna nuova [[idea]]")).toBe(
      "Appunti Una nuova idea",
    );
    expect(captureTitle("a".repeat(120))).toHaveLength(100);
    expect(captureTitle("", null, "backup.pdf")).toBe("backup.pdf");
    expect(
      captureTitle("", null, undefined, true, new Date("2026-09-21T11:42:00Z")),
    ).toContain("13:42");
    expect(captureUrl("https://example.test/article")).toBe(
      "https://example.test/article",
    );
    expect(captureUrl("javascript:alert(1)")).toBeNull();
    expect(captureUrl("leggi https://example.test")).toBeNull();
  });
  it("rejects unsupported, forged, empty and oversized uploads", () => {
    expect(() =>
      validateUpload(
        Buffer.from('<svg onload="alert(1)"/>'),
        "x.svg",
        "image/svg+xml",
      ),
    ).toThrow();
    expect(() =>
      validateUpload(Buffer.from("malware"), "photo.png", "image/png"),
    ).toThrow();
    expect(() =>
      validateUpload(Buffer.alloc(0), "empty.txt", "text/plain"),
    ).toThrow();
    expect(() =>
      validateUpload(Buffer.alloc(26 * 1024 * 1024), "large.txt", "text/plain"),
    ).toThrow();
    expect(() =>
      validateUpload(Buffer.from([0xff, 0xfe, 0]), "x.txt", "text/plain"),
    ).toThrow();
    expect(
      validateUpload(Buffer.from("# Nota\nTesto"), "x.md", "text/plain"),
    ).toBe("text/markdown");
    expect(() =>
      validateUpload(Buffer.from("# Nota"), "x.md", "text/html"),
    ).toThrow();
  });
  it("never turns a supplied filename or key into an arbitrary filesystem path", () => {
    expect(safeFilename("../../foto\r\n.png")).toBe("foto__.png");
    expect(safeFilename("C:\\private\\foto.png")).toBe("foto.png");
    const storage = new LocalFilesystemStorage("/tmp/test-storage");
    for (const key of [
      "../secret",
      "/etc/passwd",
      "..\\secret",
      "a".repeat(64) + "/x",
    ])
      expect(() => storage.path(key)).toThrow();
  });
});

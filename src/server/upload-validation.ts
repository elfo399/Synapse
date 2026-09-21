import { HttpError } from "./errors";

export function attachmentLimit() {
  const mb = Number(process.env.MAX_ATTACHMENT_SIZE_MB || 25);
  if (!Number.isFinite(mb) || mb < 1 || mb > 256)
    throw new Error("MAX_ATTACHMENT_SIZE_MB must be between 1 and 256");
  return Math.floor(mb * 1024 * 1024);
}

export function safeFilename(name: string) {
  return (
    name
      .replaceAll("\\", "/")
      .split("/")
      .pop()!
      .replace(/[\x00-\x1f\x7f<>:"|?*\u202a-\u202e\u2066-\u2069]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 200) || "allegato"
  );
}

// Content signatures, not browser-supplied MIME types, decide how bytes are served.
export function validateUpload(
  bytes: Buffer,
  name: string,
  claimed: string,
): string {
  if (!bytes.length) throw new HttpError(400, "Il file è vuoto.");
  if (bytes.length > attachmentLimit())
    throw new HttpError(413, "Il file supera il limite di caricamento.");
  const starts = (hex: string) =>
    bytes.subarray(0, hex.length / 2).equals(Buffer.from(hex, "hex"));
  const ascii = (start: number, end: number) =>
    bytes.toString("ascii", start, end);
  let mime = "";
  if (
    starts("89504e470d0a1a0a") &&
    bytes.length >= 33 &&
    ascii(12, 16) === "IHDR"
  )
    mime = "image/png";
  else if (
    starts("ffd8ff") &&
    bytes.length >= 4 &&
    bytes.subarray(-2).equals(Buffer.from([255, 217]))
  )
    mime = "image/jpeg";
  else if (["GIF87a", "GIF89a"].includes(ascii(0, 6)) && bytes.length >= 14)
    mime = "image/gif";
  else if (
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP" &&
    bytes.length >= 20
  )
    mime = "image/webp";
  else if (
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WAVE" &&
    bytes.length >= 44
  )
    mime = "audio/wav";
  else if (ascii(0, 4) === "OggS" && bytes.length >= 28) mime = "audio/ogg";
  else if (
    starts("1a45dfa3") &&
    bytes.subarray(0, 4096).includes(Buffer.from("webm"))
  )
    mime = "audio/webm";
  else if (
    ascii(4, 8) === "ftyp" &&
    ["M4A ", "M4B ", "isom", "mp42", "iso2"].includes(ascii(8, 12)) &&
    bytes.length >= 24
  )
    mime = "audio/mp4";
  else if (
    (ascii(0, 3) === "ID3" && bytes.length >= 10) ||
    (bytes.length > 4 &&
      bytes[0] === 255 &&
      (bytes[1] & 0xe0) === 0xe0 &&
      (bytes[1] & 6) !== 0 &&
      (bytes[2] & 0xf0) !== 0xf0)
  )
    mime = "audio/mpeg";
  else if (
    ascii(0, 5) === "%PDF-" &&
    bytes.subarray(-1024).includes(Buffer.from("%%EOF"))
  )
    mime = "application/pdf";
  else if (/\.(txt|md|markdown)$/i.test(name)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text))
        throw new Error("Binary content");
      mime = /\.(md|markdown)$/i.test(name) ? "text/markdown" : "text/plain";
    } catch {
      throw new HttpError(
        415,
        "Il documento deve contenere testo UTF-8 valido.",
      );
    }
  }
  const alias: Record<string, string> = {
    "audio/x-m4a": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/mp3": "audio/mpeg",
    "audio/x-wav": "audio/wav",
    "audio/wave": "audio/wav",
    "application/ogg": "audio/ogg",
    "text/x-markdown": "text/markdown",
  };
  const declared = claimed.split(";")[0].trim().toLowerCase();
  if (
    !mime ||
    (declared &&
      declared !== "application/octet-stream" &&
      (alias[declared] || declared) !== mime &&
      !(mime === "text/markdown" && declared === "text/plain"))
  ) {
    throw new HttpError(
      415,
      "Formato non supportato o contenuto del file non corrispondente al tipo dichiarato.",
    );
  }
  return mime;
}

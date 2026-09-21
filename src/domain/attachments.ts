export const ATTACHMENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,application/pdf,text/plain,text/markdown,.m4a,.mp3,.wav,.ogg,.webm,.pdf,.txt,.md";
export const MAX_CAPTURE_FILES = 10;
export interface AttachmentSummary {
  id: string;
  itemId: string;
  originalName: string;
  mimeType: string;
  size: number;
  duration: number | null;
  createdAt: string;
}
export function attachmentHref(id: string, download = false) {
  return `/api/attachments/${encodeURIComponent(id)}${download ? "?download=1" : ""}`;
}
export function fileSizeLabel(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / 1024 / 1024).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}
export function captureUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) &&
      !/\s/.test(value.trim())
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function captureTitle(
  content: string,
  url?: string | null,
  fileName?: string,
  voice = false,
  now = new Date(),
): string {
  const clean = (value: string) =>
    value
      .replace(/[\[\]|\r\n#*_`]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  if (voice)
    return `Memo vocale · ${new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", dateStyle: "medium", timeStyle: "short" }).format(now)}`;
  const text =
    clean(content) ||
    (url
      ? new URL(url).hostname + new URL(url).pathname.replace(/\/$/, "")
      : "") ||
    clean(fileName || "") ||
    "Nuova idea";
  return text.length > 100 ? `${text.slice(0, 99).trimEnd()}…` : text;
}

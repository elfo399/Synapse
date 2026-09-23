import { createHash } from "node:crypto";

export type WebResult = { id: string; title: string; url: string; domain: string; excerpt: string; sourceKind: "WEB" };
function numberEnv(name: string, fallback: number, min: number, max: number) { const value = Number(process.env[name] ?? fallback); return Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : fallback; }
export function webSearchConfig() { const enabled = process.env.WEB_SEARCH_ENABLED === "true"; const baseUrl = (process.env.SEARXNG_BASE_URL ?? "http://searxng:8080").replace(/\/$/, ""); let validUrl = true; try { const url = new URL(baseUrl); validUrl = url.protocol === "http:" || url.protocol === "https:"; } catch { validUrl = false; } return { enabled, baseUrl, validUrl, maxResults: numberEnv("WEB_SEARCH_MAX_RESULTS", 3, 1, 3), timeoutMs: numberEnv("WEB_SEARCH_TIMEOUT_MS", 8_000, 1_000, 15_000) }; }
function clean(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }
function safeHttpUrl(value: string) { try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:" ? url : null; } catch { return null; } }

/** SearXNG receives only the user's question; private Synapse data is never part of this request. */
export async function searchWeb(question: string): Promise<WebResult[]> {
  const config = webSearchConfig(); if (!config.enabled || !config.validUrl) return [];
  const url = new URL(`${config.baseUrl}/search`); url.searchParams.set("q", question); url.searchParams.set("format", "json"); url.searchParams.set("language", "it-IT");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(config.timeoutMs) }); if (!response.ok) throw new Error("La ricerca web non è disponibile.");
  const body = await response.json() as { results?: { title?: unknown; url?: unknown; content?: unknown }[] };
  return (body.results ?? []).flatMap((entry) => { const title = clean(entry.title); const parsed = safeHttpUrl(clean(entry.url)); const excerpt = clean(entry.content); if (!title || !parsed || !excerpt) return []; return [{ id: `web-${createHash("sha256").update(parsed.href).digest("hex").slice(0, 16)}`, title, url: parsed.href, domain: parsed.hostname, excerpt: excerpt.slice(0, 900), sourceKind: "WEB" as const }]; }).slice(0, config.maxResults);
}
export async function webSearchStatus() { const config = webSearchConfig(); if (!config.enabled || !config.validUrl) return { enabled: config.enabled, reachable: false }; try { const response = await fetch(`${config.baseUrl}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(Math.min(config.timeoutMs, 4_000)) }); return { enabled: true, reachable: response.ok }; } catch { return { enabled: true, reachable: false }; } }

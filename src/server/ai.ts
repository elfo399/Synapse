import { ItemType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getItemHref } from "@/domain/item-url";
import { semanticSearch, indexStatus, processEmbeddingJobs } from "@/server/ai-index";
import { searchItems } from "@/server/search";
import { searchWebAutomatically, webSearchConfig, webSearchStatus } from "@/server/web-search";
import { HttpError } from "@/server/errors";

export type AiMode = "AUTO" | "KNOWLEDGE" | "GENERAL" | "WEB" | "COMBINED";
export type AiStrategy = "DIRECT" | "KNOWLEDGE" | "WEB" | "COMBINED";
export type AiSourceKind = "SYNAPSE" | "WEB";

export type AiSource = {
  id: string;
  kind: AiSourceKind;
  title: string;
  excerpt?: string;
  href?: string;
  score?: number;
  citation?: string;
  sourceKind?: AiSourceKind;
  type?: string;
  usage?: "CITED" | "CONSULTED";
};

export type AiChatOptions = {
  webSearch?: boolean;
  reasoning?: boolean;
};

type ChatMessage = { role: "user" | "assistant"; content: string };
type ToolName =
  | "search_knowledge"
  | "list_items"
  | "get_project"
  | "get_relations"
  | "search_web"
  | "get_time"
  | "respond";

type ToolCall = {
  name: ToolName;
  query?: string;
  project?: string;
  itemType?: string;
  timezone?: string;
  limit?: number;
};

type ToolPlan = { tools: ToolCall[] };
type PlannerOutcome =
  | { state: "planned"; plan: ToolPlan; corrected: boolean }
  | { state: "failed"; reason: "invalid_json" | "invalid_tool" | "planner_timeout" | "planner_unavailable" };
type ToolExecution = {
  sources: AiSource[];
  context: string[];
  activeProjectId?: string | null;
  used: Set<ToolName>;
};
export type AssistantCatalogResult = {
  state: "ok" | "invalid_type";
  itemType?: ItemType;
  total?: number;
  items: Array<{ id: string; title: string; status: string; href: string }>;
  truncated?: boolean;
  sources: AiSource[];
};

export const DEFAULT_OLLAMA_MODEL = "qwen3:1.7b";
export const DEFAULT_AI_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
const MAX_HISTORY_MESSAGES = 12;
const MAX_TOOL_CALLS = 3;
const MAX_TOOL_LIMIT = 25;
let activeGeneration = false;

function traceAi(event: string, data: Record<string, string | number | boolean | undefined> = {}) {
  if (process.env.NODE_ENV !== "development") return;
  // Metadata only: never include messages, notes, prompts, URLs, or item titles.
  console.info("[synapse-ai]", event, data);
}

function numberEnv(name: string, fallback: number, min: number, max: number) {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

export function aiConfig() {
  const baseUrl = (process.env.OLLAMA_BASE_URL ?? process.env.OLLAMA_URL ?? "http://ollama:11434").replace(/\/$/, "");
  let validUrl = true;
  try { const url = new URL(baseUrl); validUrl = url.protocol === "http:" || url.protocol === "https:"; } catch { validUrl = false; }
  return {
    enabled: process.env.AI_ENABLED === "true",
    baseUrl,
    validUrl,
    model: process.env.OLLAMA_CHAT_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL,
    embeddingModel: process.env.OLLAMA_EMBEDDING_MODEL ?? "qwen3-embedding:0.6b",
    timeoutMs: numberEnv("OLLAMA_TIMEOUT_MS", 90_000, 5_000, 300_000),
    maxTokens: numberEnv("AI_MAX_TOKENS", 500, 64, 1_024),
    contextTokens: numberEnv("AI_CONTEXT_TOKENS", 4_096, 1_024, 8_192),
  };
}

function isQwen3Model(model: string) { return /^qwen3(?::|$)/i.test(model.trim()); }

export const SYNAPSE_IDENTITY_PROMPT = `Sei Synapse, l'assistente AI personale integrato nell'applicazione Synapse.
Il tuo nome è Synapse. Aiuti l'utente a organizzare conoscenze, note, attività e progetti, a sviluppare idee e a trovare informazioni.
Rispondi principalmente in italiano, in modo naturale, preciso e cordiale. Parla in prima persona quando descrivi le tue funzionalità.
Non presentarti spontaneamente come Qwen, Ollama o un modello di linguaggio senza nome. Se richiesto, spiega correttamente che Synapse utilizza il modello configurato, eseguito localmente tramite Ollama.
Non fingere di essere una persona, di possedere esperienze personali o di avere capacità non implementate. Non inventare dati privati o dati Web assenti.
Usa soltanto i dati forniti nel contesto degli strumenti. Se mancano dati utili, dichiaralo chiaramente. Non citare fonti che non sono state usate.`;

export async function ollama(path: string, init?: RequestInit) {
  const config = aiConfig();
  if (!config.enabled) throw new HttpError(503, "L'assistente AI non è abilitato.");
  if (!config.validUrl) throw new HttpError(503, "La configurazione di Ollama non è valida.");
  return fetch(`${config.baseUrl}${path}`, { ...init, cache: "no-store" });
}

export async function aiStatus() {
  const config = aiConfig();
  const [semantic, web] = await Promise.all([indexStatus(), webSearchStatus()]);
  const base = {
    model: config.model,
    chatModel: config.model,
    embeddingModel: config.embeddingModel,
    reasoningAvailable: isQwen3Model(config.model),
    semantic,
    web,
  };
  if (!config.enabled || !config.validUrl) return { state: config.enabled ? "offline" as const : "disabled" as const, ...base, ollamaReachable: false, chatModelReady: false, embeddingModelReady: false };
  try {
    const response = await ollama("/api/tags", { signal: AbortSignal.timeout(Math.min(config.timeoutMs, 8_000)) });
    if (!response.ok) throw new Error("offline");
    const body = await response.json() as { models?: Array<{ name?: string }> };
    const models = body.models ?? [];
    const has = (model: string) => models.some((entry) => entry.name === model || entry.name === `${model}:latest`);
    const chatModelReady = has(config.model);
    return { state: chatModelReady ? "ready" as const : "model_missing" as const, ...base, ollamaReachable: true, chatModelReady, embeddingModelReady: has(config.embeddingModel) };
  } catch {
    return { state: "offline" as const, ...base, ollamaReachable: false, chatModelReady: false, embeddingModelReady: false };
  }
}
function sourceKey(source: AiSource) {
  return `${source.kind}:${source.href || source.id}`;
}

function uniqueSources(sources: AiSource[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((source, index) => ({
    ...source,
    citation: `[S${index + 1}]`,
    sourceKind: source.kind,
    type: source.kind === "WEB" ? "WEB" : "ITEM",
    usage: "CITED" as const,
  }));
}

function clampLimit(value: unknown, fallback = 8) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(MAX_TOOL_LIMIT, Math.max(1, Math.floor(parsed)));
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("it-IT").replace(/\s+/g, " ");
}

function validItemType(value: unknown): ItemType | undefined {
  return typeof value === "string" && Object.values(ItemType).includes(value as ItemType)
    ? (value as ItemType)
    : undefined;
}

const TOOL_NAMES = new Set<ToolName>([
  "search_knowledge", "list_items", "get_project", "get_relations", "search_web", "get_time", "respond",
]);
const PLAN_FORMAT = {
  type: "object",
  additionalProperties: false,
  required: ["tools"],
  properties: {
    tools: {
      type: "array",
      minItems: 1,
      maxItems: MAX_TOOL_CALLS,
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", enum: [...TOOL_NAMES] },
          query: { type: "string" },
          project: { type: "string" },
          itemType: { type: "string", enum: Object.values(ItemType) },
          timezone: { type: "string" },
          limit: { type: "integer", minimum: 1, maximum: MAX_TOOL_LIMIT },
        },
      },
    },
  },
};

function isValidTimezone(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try { new Intl.DateTimeFormat("it-IT", { timeZone: value }); return true; } catch { return false; }
}

function toolPlanPrompt(args: { webAllowed: boolean; activeProjectTitle?: string | null; history: ChatMessage[]; correction?: string }) {
  const conversation = args.history.slice(-4).map((message) => `${message.role === "user" ? "Utente" : "Synapse"}: ${message.content.slice(0, 600)}`).join("\n");
  return `Sei il pianificatore interno di Synapse. Scegli al massimo ${MAX_TOOL_CALLS} strumenti utili, senza mai generare una risposta per l'utente.
Rispondi esclusivamente con JSON conforme allo schema fornito.
Strumenti: search_knowledge per il contenuto degli Item; list_items per elencare o contare elementi e richiede sempre itemType valido; get_project per un progetto nominato o __ACTIVE__; get_relations per i collegamenti di un progetto; search_web per dati esterni; get_time per data e ora; respond se non serve alcun recupero.
Per elenchi o conteggi di progetti devi scegliere list_items con itemType PROJECT, mai search_knowledge. Non inventare ID o titoli. Per dati personali ambigui scegli respond o search_knowledge. search_web ? ${args.webAllowed ? "consentito" : "vietato"}.
Il progetto attivo, validato dal server, ? ${args.activeProjectTitle ? `"${args.activeProjectTitle}"` : "assente"}. Cronologia recente della stessa conversazione:\n${conversation || "nessuna"}${args.correction ? `\nCorreggi il piano precedente: ${args.correction}.` : ""}`;
}

export function parseToolPlan(content: string): { ok: true; plan: ToolPlan } | { ok: false; reason: "invalid_json" | "invalid_tool" } {
  const candidate = content.match(/\{[\s\S]*\}/)?.[0] || content;
  let parsed: { tools?: unknown };
  try { parsed = JSON.parse(candidate) as { tools?: unknown }; } catch { return { ok: false, reason: "invalid_json" }; }
  if (!Array.isArray(parsed.tools) || !parsed.tools.length || parsed.tools.length > MAX_TOOL_CALLS) return { ok: false, reason: "invalid_tool" };
  const tools: ToolCall[] = [];
  for (const raw of parsed.tools) {
    if (!raw || typeof raw !== "object") return { ok: false, reason: "invalid_tool" };
    const call = raw as Record<string, unknown>;
    if (typeof call.name !== "string" || !TOOL_NAMES.has(call.name as ToolName)) return { ok: false, reason: "invalid_tool" };
    const name = call.name as ToolName;
    const query = typeof call.query === "string" ? call.query.trim().slice(0, 500) : undefined;
    const project = typeof call.project === "string" ? call.project.trim().slice(0, 180) : undefined;
    const itemType = typeof call.itemType === "string" ? call.itemType : undefined;
    const timezone = typeof call.timezone === "string" ? call.timezone.trim() : undefined;
    if (name === "list_items" && !validItemType(itemType)) return { ok: false, reason: "invalid_tool" };
    if (name === "search_knowledge" && !query) return { ok: false, reason: "invalid_tool" };
    if ((name === "get_project" || name === "get_relations") && !project) return { ok: false, reason: "invalid_tool" };
    if (name === "get_time" && !isValidTimezone(timezone)) return { ok: false, reason: "invalid_tool" };
    tools.push({ name, query, project, itemType, timezone, limit: clampLimit(call.limit) });
  }
  return { ok: true, plan: { tools } };
}

async function requestToolPlan(args: { question: string; webAllowed: boolean; activeProjectTitle?: string | null; history: ChatMessage[]; correction?: string }) {
  const config = aiConfig();
  const response = await ollama("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: false,
      ...(isQwen3Model(config.model) ? { think: false } : {}),
      format: PLAN_FORMAT,
      options: { temperature: 0, num_predict: 220, num_ctx: config.contextTokens },
      messages: [
        { role: "system", content: toolPlanPrompt(args) },
        { role: "user", content: args.question },
      ],
    }),
    signal: AbortSignal.timeout(Math.min(config.timeoutMs, 20_000)),
  });
  if (!response.ok) throw new Error("planner_unavailable");
  const payload = await response.json() as { message?: { content?: string } };
  return parseToolPlan(payload.message?.content || "");
}

async function planTools(args: { question: string; webAllowed: boolean; activeProjectTitle?: string | null; history: ChatMessage[] }): Promise<PlannerOutcome> {
  const startedAt = Date.now();
  try {
    const first = await requestToolPlan(args);
    if (first.ok) {
      traceAi("planner_requested", { tools: first.plan.tools.map((tool) => tool.name).join(","), toolCount: first.plan.tools.length, elapsedMs: Date.now() - startedAt });
      return { state: "planned", plan: first.plan, corrected: false };
    }
    traceAi("planner_parse_error", { reason: first.reason });
    const corrected = await requestToolPlan({ ...args, correction: first.reason });
    if (corrected.ok) {
      traceAi("planner_requested", { tools: corrected.plan.tools.map((tool) => tool.name).join(","), toolCount: corrected.plan.tools.length, corrected: true, elapsedMs: Date.now() - startedAt });
      return { state: "planned", plan: corrected.plan, corrected: true };
    }
    traceAi("planner_parse_error", { reason: corrected.reason, corrected: true });
    return { state: "failed", reason: corrected.reason };
  } catch (error) {
    const reason = error instanceof DOMException && error.name === "TimeoutError" ? "planner_timeout" : "planner_unavailable";
    traceAi("planner_failed", { reason, elapsedMs: Date.now() - startedAt });
    return { state: "failed", reason };
  }
}

async function resolveProject(userId: string, projectRef: string | undefined, activeProjectId?: string | null) {
  if (projectRef === "__ACTIVE__" && activeProjectId) {
    return prisma.item.findFirst({ where: { id: activeProjectId, userId, type: "PROJECT", archivedAt: null } });
  }
  if (!projectRef?.trim()) return null;
  const projects = await prisma.item.findMany({
    where: { userId, type: "PROJECT", archivedAt: null },
    select: { id: true, title: true, status: true, content: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const wanted = normalize(projectRef);
  const exact = projects.find((project) => normalize(project.title) === wanted);
  if (exact) return exact;
  const matches = projects.filter((project) => {
    const title = normalize(project.title);
    return title.includes(wanted) || wanted.includes(title);
  });
  return matches.length === 1 ? matches[0] : null;
}

function itemSource(item: { id: string; title: string; content?: string | null; type: ItemType }) : AiSource {
  return {
    id: item.id,
    kind: "SYNAPSE",
    title: item.title,
    excerpt: item.content?.replace(/\s+/g, " ").slice(0, 280) || `${item.type} senza descrizione.`,
    href: getItemHref(item),
  };
}

export async function listAssistantItems(userId: string, itemType: unknown, limit: unknown): Promise<AssistantCatalogResult> {
  const type = validItemType(itemType);
  if (!type) {
    traceAi("tool_result", { tool: "list_items", state: "invalid_type" });
    return { state: "invalid_type", items: [], sources: [] };
  }
  const take = clampLimit(limit);
  const where = { userId, type, archivedAt: null } as const;
  const [total, rows] = await prisma.$transaction([
    prisma.item.count({ where }),
    prisma.item.findMany({
      where,
      select: { id: true, title: true, content: true, type: true, status: true },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      take,
    }),
  ]);
  const items = rows.map((item) => ({ id: item.id, title: item.title, status: item.status, href: getItemHref(item) }));
  const sources = rows.map(itemSource);
  traceAi("tool_result", { tool: "list_items", itemType: type, total, returned: rows.length });
  return { state: "ok", itemType: type, total, items, truncated: total > rows.length, sources };
}
async function projectContext(userId: string, project: { id: string; title: string; content?: string | null; status?: string | null }) {
  const related = await prisma.itemRelation.findMany({
    where: {
      userId,
      OR: [
        { sourceItemId: project.id, source: { userId } },
        { targetItemId: project.id, target: { userId } },
      ],
    },
    include: {
      source: { select: { id: true, title: true, content: true, type: true, status: true } },
      target: { select: { id: true, title: true, content: true, type: true, status: true } },
    },
    take: 40,
  });
  const linked = related.map((relation) => relation.sourceItemId === project.id ? relation.target : relation.source)
    .filter((item) => item.id !== project.id);
  const unique = linked.filter((item, index) => linked.findIndex((candidate) => candidate.id === item.id) === index);
  return {
    sources: uniqueSources([itemSource({ ...project, type: "PROJECT" }), ...unique.map(itemSource)]),
    context: [
      `Progetto: ${project.title}${project.status ? ` — stato ${project.status}` : ""}.`,
      project.content ? `Descrizione: ${project.content.slice(0, 1800)}` : "Descrizione non disponibile.",
      unique.length ? `Elementi collegati:\n${unique.map((item) => `- ${item.type}: ${item.title}${item.status ? ` — ${item.status}` : ""}`).join("\n")}` : "Nessun elemento collegato.",
    ].join("\n"),
  };
}

type KnowledgeSearchResult = { state: "ok" | "empty" | "failed"; sources: AiSource[]; context: string };

async function searchKnowledge(userId: string, query: string, limit: number): Promise<KnowledgeSearchResult> {
  void processEmbeddingJobs(1).catch(() => undefined);
  const [lexical, semantic] = await Promise.allSettled([
    searchItems(userId, { q: query, archive: "active", limit }),
    semanticSearch(userId, query, limit),
  ]);
  if (lexical.status === "rejected" && semantic.status === "rejected") {
    traceAi("tool_result", { tool: "search_knowledge", state: "failed" });
    return { state: "failed", sources: [], context: "Il recupero delle conoscenze non ? disponibile per questa risposta; l'assenza di fonti non indica che l'archivio sia vuoto." };
  }
  const lexicalIds = lexical.status === "fulfilled" ? lexical.value.items.map((item) => item.id) : [];
  const semanticIds = semantic.status === "fulfilled" ? semantic.value.map((item) => item.itemId) : [];
  const ids = [...new Set([...lexicalIds, ...semanticIds])].slice(0, limit);
  if (!ids.length) {
    traceAi("tool_result", { tool: "search_knowledge", state: "empty" });
    return { state: "empty", sources: [], context: "Nessuna conoscenza pertinente ? stata trovata per questa ricerca." };
  }
  const items = await prisma.item.findMany({
    where: { userId, id: { in: ids }, archivedAt: null },
    select: { id: true, title: true, content: true, type: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [itemSource(item)] : [];
  });
  traceAi("tool_result", { tool: "search_knowledge", state: "ok", returned: sources.length, ftsAvailable: lexical.status === "fulfilled", vectorAvailable: semantic.status === "fulfilled" });
  return {
    state: "ok",
    sources,
    context: sources.map((source) => `- ${source.title}: ${source.excerpt}`).join("\n"),
  };
}
function timeContext(timezone: string) {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("it-IT", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "medium",
  });
  return `Ora deterministica del server per ${timezone}: ${formatter.format(now)}.`;
}

function applyConversationMode(plan: ToolPlan, mode: AiMode, question: string, webAllowed: boolean): ToolPlan {
  if (mode === "KNOWLEDGE") {
    const local = plan.tools.filter((tool) => tool.name !== "search_web");
    return { tools: local.length ? local : [{ name: "respond" }] };
  }
  if (mode === "WEB") return { tools: [webAllowed ? { name: "search_web", query: question } : { name: "respond" }] };
  if (mode === "COMBINED") {
    const withLocal = plan.tools.some((tool) => ["search_knowledge", "list_items", "get_project", "get_relations"].includes(tool.name))
      ? plan.tools
      : [{ name: "search_knowledge" as const, query: question, limit: 8 }, ...plan.tools];
    const withWeb = webAllowed && !withLocal.some((tool) => tool.name === "search_web")
      ? [...withLocal, { name: "search_web" as const, query: question }]
      : withLocal;
    return { tools: withWeb.slice(0, MAX_TOOL_CALLS) };
  }
  return plan;
}

async function executeTools(args: {
  userId: string;
  question: string;
  plan: ToolPlan;
  webAllowed: boolean;
  activeProjectId?: string | null;
}): Promise<ToolExecution> {
  const result: ToolExecution = { sources: [], context: [], activeProjectId: args.activeProjectId, used: new Set() };

  for (const tool of args.plan.tools) {
    result.used.add(tool.name);
    traceAi("tool_executed", { tool: tool.name });
    if (tool.name === "respond") continue;
    if (tool.name === "search_knowledge") {
      const knowledge = await searchKnowledge(args.userId, tool.query!, clampLimit(tool.limit));
      result.sources.push(...knowledge.sources);
      result.context.push(`Risultato search_knowledge (${knowledge.state}):\n${knowledge.context}`);
      continue;
    }
    if (tool.name === "list_items") {
      const catalog = await listAssistantItems(args.userId, tool.itemType, tool.limit);
      if (catalog.state === "invalid_type") {
        result.context.push("Lo strumento list_items ha ricevuto un tipo non valido: non ? stata eseguita una ricerca generica e non si pu? dedurre che l'archivio sia vuoto.");
      } else {
        result.sources.push(...catalog.sources);
        result.context.push(`Catalogo strutturato Synapse:\n${JSON.stringify({ itemType: catalog.itemType, total: catalog.total, items: catalog.items, truncated: catalog.truncated })}`);
      }
      continue;
    }
    if (tool.name === "get_project" || tool.name === "get_relations") {
      const project = await resolveProject(args.userId, tool.project, result.activeProjectId);
      if (!project) {
        traceAi("tool_result", { tool: tool.name, state: "not_found" });
        result.context.push("Il progetto richiesto non ? stato identificato in modo univoco nell'account corrente. Questo non equivale a un archivio di progetti vuoto.");
        continue;
      }
      result.activeProjectId = project.id;
      const context = await projectContext(args.userId, project);
      result.sources.push(...context.sources);
      traceAi("tool_result", { tool: tool.name, state: "ok", returned: context.sources.length });
      result.context.push(`${tool.name === "get_relations" ? "Relazioni del progetto" : "Contesto del progetto"}:\n${context.context}`);
      continue;
    }
    if (tool.name === "search_web") {
      if (!args.webAllowed) {
        result.context.push("La ricerca Web non ? autorizzata per questa richiesta.");
        continue;
      }
      // SearXNG receives the user's message only; local results never leave Synapse.
      try {
        const web = await searchWebAutomatically(args.question);
        result.sources.push(...web.map((item) => ({ id: item.id, kind: "WEB" as const, title: item.title, excerpt: item.excerpt, href: item.url })));
        traceAi("tool_result", { tool: "search_web", returned: web.length });
        result.context.push(web.length
          ? `Risultati Web verificati:\n${web.map((item) => `- ${item.title}: ${item.excerpt}\n  ${item.url}`).join("\n")}`
          : "La ricerca Web non ha restituito fonti sufficienti.");
      } catch {
        traceAi("tool_failed", { tool: "search_web" });
        result.context.push("La ricerca Web non ? disponibile per questa risposta: non presentare informazioni come aggiornate o verificate.");
      }
      continue;
    }
    if (tool.name === "get_time") result.context.push(timeContext(tool.timezone!));
  }

  const sources = uniqueSources(result.sources);
  traceAi("final_context", { sourceCount: sources.length, toolCount: result.used.size });
  return { ...result, sources };
}
export function buildSystemPrompt(_strategy: AiStrategy, sources: AiSource[], toolContext = "") {
  const sourceInstructions = sources.length
    ? "Le fonti usate sono elencate dopo la risposta. Cita nel testo solo le fonti realmente utili usando [S1], [S2] e così via."
    : "Non sono state recuperate fonti: non aggiungere citazioni e non inventare dati aggiornati.";
  return `${SYNAPSE_IDENTITY_PROMPT}\n\n${sourceInstructions}\n\nContesto degli strumenti:\n${toolContext || "Nessun contesto aggiuntivo."}`;
}

function strategyFromTools(tools: Set<ToolName>): AiStrategy {
  const local = tools.has("search_knowledge") || tools.has("list_items") || tools.has("get_project") || tools.has("get_relations");
  const web = tools.has("search_web");
  if (local && web) return "COMBINED";
  if (web) return "WEB";
  if (local) return "KNOWLEDGE";
  return "DIRECT";
}

export async function beginAutomaticGeneration(args: {
  userId: string;
  conversationId: string;
  content: string;
  options?: AiChatOptions;
}) {
  if (activeGeneration) throw new Error("Attendi il completamento della risposta in corso.");
  const content = args.content.trim();
  if (!content) throw new Error("Scrivi un messaggio prima di inviare.");
  activeGeneration = true;

  try {
    const conversation = await prisma.aiConversation.findFirst({ where: { id: args.conversationId, userId: args.userId } });
    if (!conversation) throw new Error("Conversazione non trovata.");

    const activeProject = conversation.activeProjectId
      ? await prisma.item.findFirst({ where: { id: conversation.activeProjectId, userId: args.userId, type: "PROJECT", archivedAt: null }, select: { id: true, title: true } })
      : null;
    const options: AiChatOptions = {
      webSearch: args.options?.webSearch ?? true,
      reasoning: args.options?.reasoning ?? false,
    };
    const historyRows = await prisma.aiMessage.findMany({
      where: { conversationId: conversation.id, state: "COMPLETE" },
      select: { role: true, content: true },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
    });
    const history: ChatMessage[] = historyRows.reverse().map((message) => ({
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
    }));
    const webAllowed = Boolean(options.webSearch && webSearchConfig().enabled && webSearchConfig().validUrl);
    const planning = await planTools({ question: content, webAllowed, activeProjectTitle: activeProject?.title, history });
    const plan = planning.state === "planned"
      ? applyConversationMode(planning.plan, conversation.mode as AiMode, content, webAllowed)
      : { tools: [] };
    const execution = await executeTools({
      userId: args.userId,
      question: content,
      plan,
      webAllowed,
      activeProjectId: activeProject?.id || null,
    });
    if (planning.state === "failed") {
      execution.context.unshift(`Il pianificatore degli strumenti non ? riuscito a completare il recupero (${planning.reason}). Non dichiarare l'archivio vuoto: spiega che le fonti personali non sono state consultate per questa risposta.`);
      traceAi("planner_fallback", { reason: planning.reason });
    }

    await updateConversationPreferences(args.userId, conversation.id, options);
    if (conversation.title === "Nuova conversazione") {
      await prisma.aiConversation.updateMany({ where: { id: conversation.id, userId: args.userId, title: "Nuova conversazione" }, data: { title: titleFromFirstMessage(content) } });
      conversation.title = titleFromFirstMessage(content);
    }
    const userMessage = await prisma.aiMessage.create({ data: { conversationId: conversation.id, role: "USER", content, options: options as unknown as Prisma.InputJsonValue } });
    if (execution.activeProjectId !== conversation.activeProjectId) {
      await prisma.aiConversation.update({ where: { id: conversation.id }, data: { activeProjectId: execution.activeProjectId ?? null } });
      conversation.activeProjectId = execution.activeProjectId ?? null;
    }
    return {
      conversation,
      userMessage,
      options,
      sources: execution.sources,
      toolContext: execution.context.join("\n\n"),
      strategy: strategyFromTools(execution.used),
      history,
    };
  } catch (error) {
    activeGeneration = false;
    throw error;
  }
}

export async function openRoutedOllamaStream(
  strategy: AiStrategy,
  question: string,
  history: ChatMessage[],
  sources: AiSource[],
  signal: AbortSignal,
  reasoning = false,
  toolContext = "",
) {
  const config = aiConfig();
  const response = await ollama("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      stream: true,
      options: { num_predict: config.maxTokens, num_ctx: config.contextTokens },
      ...(isQwen3Model(config.model) ? { think: reasoning } : {}),
      messages: [
        { role: "system", content: buildSystemPrompt(strategy, sources, toolContext) },
        ...history,
        { role: "user", content: question },
      ],
    }),
    signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    throw new Error(text || "Ollama non ha restituito una risposta.");
  }
  return response.body;
}

export async function completeGeneration(args: {
  conversationId: string;
  content: string;
  sources: AiSource[];
}) {
  const cited = new Set([...args.content.matchAll(/\[S\d+\]/g)].map((match) => match[0]));
  const persistedSources = args.sources.map((source) => ({
    ...source,
    usage: source.citation && cited.has(source.citation) ? "CITED" as const : "CONSULTED" as const,
  }));
  const [message] = await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        conversationId: args.conversationId,
        role: "ASSISTANT",
        content: args.content,
        sources: persistedSources as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.aiConversation.update({ where: { id: args.conversationId }, data: { updatedAt: new Date() } }),
  ]);
  activeGeneration = false;
  return { message, sources: persistedSources };
}

export function abortGeneration() {
  activeGeneration = false;
}

// Compatibility for the API surface used by existing callers. Both paths use the same Qwen final response.
export async function beginGeneration(args: Parameters<typeof beginAutomaticGeneration>[0]) {
  return beginAutomaticGeneration(args);
}

export async function openOllamaStream(args: {
  mode: AiMode;
  question: string;
  history: ChatMessage[];
  sources: AiSource[];
  signal: AbortSignal;
  reasoning?: boolean;
  toolContext?: string;
}) {
  const manualStrategy: AiStrategy = args.mode === "WEB" ? "WEB" : args.mode === "COMBINED" ? "COMBINED" : args.mode === "KNOWLEDGE" ? "KNOWLEDGE" : "DIRECT";
  return openRoutedOllamaStream(manualStrategy, args.question, args.history, args.sources, args.signal, args.reasoning, args.toolContext);
}


function titleFromFirstMessage(content: string) {
  const value = content.replace(/\s+/g, " ").trim().replace(/[.!?]+$/g, "");
  return value.length <= 60 ? value : `${value.slice(0, 57).trimEnd()}…`;
}

export async function listConversations(userId: string) {
  return prisma.aiConversation.findMany({
    where: { userId }, orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, mode: true, webSearchEnabled: true, reasoningEnabled: true, updatedAt: true, _count: { select: { messages: true } } },
  });
}
export async function getConversation(userId: string, id: string) {
  const conversation = await prisma.aiConversation.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!conversation) throw new HttpError(404, "Conversazione non trovata.");
  return conversation;
}
export async function createConversation(userId: string, mode: AiMode = "AUTO", title = "Nuova conversazione", preferences: AiChatOptions = {}) {
  return prisma.aiConversation.create({ data: { userId, mode, title: title.trim().slice(0, 160) || "Nuova conversazione", webSearchEnabled: preferences.webSearch ?? mode === "AUTO", reasoningEnabled: preferences.reasoning ?? false } });
}
export async function renameConversation(userId: string, id: string, title: string) {
  const updated = await prisma.aiConversation.updateMany({ where: { id, userId }, data: { title: title.trim().slice(0, 160) } });
  if (!updated.count) throw new HttpError(404, "Conversazione non trovata.");
}
export async function updateConversationPreferences(userId: string, id: string, preferences: AiChatOptions) {
  const updated = await prisma.aiConversation.updateMany({ where: { id, userId }, data: { webSearchEnabled: Boolean(preferences.webSearch), reasoningEnabled: Boolean(preferences.reasoning) } });
  if (!updated.count) throw new HttpError(404, "Conversazione non trovata.");
}
export async function deleteConversation(userId: string, id: string) {
  const deleted = await prisma.aiConversation.deleteMany({ where: { id, userId } });
  if (!deleted.count) throw new HttpError(404, "Conversazione non trovata.");
}

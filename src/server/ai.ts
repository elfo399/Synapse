import { ItemType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import { getItemHref } from "@/domain/item-url";
import { semanticSearch, indexStatus, processEmbeddingJobs } from "@/server/ai-index";
import { searchItems } from "@/server/search";
import { searchWeb, webSearchConfig, webSearchStatus } from "@/server/web-search";
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
type ToolExecution = {
  sources: AiSource[];
  context: string[];
  activeProjectId?: string | null;
  used: Set<ToolName>;
};

export const DEFAULT_OLLAMA_MODEL = "qwen3:1.7b";
export const DEFAULT_AI_MODEL = process.env.OLLAMA_CHAT_MODEL?.trim() || process.env.OLLAMA_MODEL?.trim() || DEFAULT_OLLAMA_MODEL;
const MAX_HISTORY_MESSAGES = 12;
const MAX_TOOL_CALLS = 3;
const MAX_TOOL_LIMIT = 25;
const defaultZone = process.env.APP_TIMEZONE ?? process.env.TZ ?? "Europe/Rome";
let activeGeneration = false;

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

function validTimezone(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return defaultZone;
  try {
    new Intl.DateTimeFormat("it-IT", { timeZone: value });
    return value;
  } catch {
    return defaultZone;
  }
}

function toolPlanPrompt(webAllowed: boolean, activeProjectTitle?: string | null) {
  return `Sei il pianificatore interno di Synapse. Scegli al massimo ${MAX_TOOL_CALLS} strumenti utili, senza mai generare una risposta per l'utente.
Rispondi SOLO con JSON nel formato {"tools":[...]}. Ogni strumento deve essere uno di:
- search_knowledge: {"name":"search_knowledge","query":"domanda o parole chiave","limit":1-25}
- list_items: {"name":"list_items","itemType":"PROJECT|NOTE|TASK|RESOURCE|AREA|...","limit":1-25}; usalo per conteggi o elenchi espliciti
- get_project: {"name":"get_project","project":"titolo del progetto o __ACTIVE__"}; usalo per informazioni su uno specifico progetto
- get_relations: {"name":"get_relations","project":"titolo del progetto o __ACTIVE__"}; usalo per elementi collegati
- search_web: {"name":"search_web","query":"domanda pubblica dell'utente"}; disponibile solo se Web è consentito
- get_time: {"name":"get_time","timezone":"Area/Città"}; per data o ora
- respond: {"name":"respond"}; se nessun recupero è necessario.
Non inventare titoli o ID. Per domande ambigue su dati personali scegli respond o search_knowledge. Non usare search_web quando Web non è consentito. Il progetto attivo della conversazione ? ${activeProjectTitle ? `"${activeProjectTitle}"` : "assente"}.`;
}

function parsePlan(content: string): ToolPlan | null {
  const candidate = content.match(/\{[\s\S]*\}/)?.[0] || content;
  try {
    const parsed = JSON.parse(candidate) as { tools?: unknown };
    if (!Array.isArray(parsed.tools)) return null;
    const allowed = new Set<ToolName>([
      "search_knowledge", "list_items", "get_project", "get_relations", "search_web", "get_time", "respond",
    ]);
    const tools: ToolCall[] = [];
    for (const raw of parsed.tools.slice(0, MAX_TOOL_CALLS)) {
      if (!raw || typeof raw !== "object") continue;
      const call = raw as Record<string, unknown>;
      if (typeof call.name !== "string" || !allowed.has(call.name as ToolName)) continue;
      tools.push({
        name: call.name as ToolName,
        query: typeof call.query === "string" ? call.query.slice(0, 500) : undefined,
        project: typeof call.project === "string" ? call.project.slice(0, 180) : undefined,
        itemType: typeof call.itemType === "string" ? call.itemType : undefined,
        timezone: typeof call.timezone === "string" ? call.timezone : undefined,
        limit: clampLimit(call.limit),
      });
    }
    return { tools: tools.length ? tools : [{ name: "respond" }] };
  } catch {
    return null;
  }
}

async function planTools(question: string, webAllowed: boolean, activeProjectTitle?: string | null): Promise<ToolPlan> {
  try {
    const response = await ollama("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: aiConfig().model,
        stream: false,
        ...(isQwen3Model(aiConfig().model) ? { think: false } : {}),
        format: "json",
        options: { temperature: 0, num_predict: 220 },
        messages: [
          { role: "system", content: toolPlanPrompt(webAllowed, activeProjectTitle) },
          { role: "user", content: question },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { tools: [{ name: "respond" }] };
    const payload = (await response.json()) as { message?: { content?: string } };
    return parsePlan(payload.message?.content || "") || { tools: [{ name: "respond" }] };
  } catch {
    return { tools: [{ name: "respond" }] };
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

async function listItems(userId: string, type: ItemType | undefined, limit: number) {
  const items = await prisma.item.findMany({
    where: { userId, archivedAt: null, ...(type ? { type } : {}) },
    select: { id: true, title: true, content: true, type: true, status: true, dueAt: true },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });
  return {
    sources: items.map(itemSource),
    context: items.length
      ? items.map((item) => `- ${item.type}: ${item.title}${item.status ? ` — stato ${item.status}` : ""}${item.dueAt ? ` — scadenza ${item.dueAt.toLocaleDateString("it-IT")}` : ""}`).join("\n")
      : "Nessun elemento corrispondente nell'account corrente.",
  };
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

async function searchKnowledge(userId: string, query: string, limit: number) {
  const lexical = await searchItems(userId, { q: query, archive: "active", limit }).catch(() => ({ items: [] }));
  void processEmbeddingJobs(1).catch(() => undefined);
  const semantic = await semanticSearch(userId, query, limit).catch(() => []);
  const ids = [...new Set([...lexical.items.map((item) => item.id), ...semantic.map((item) => item.itemId)])].slice(0, limit);
  if (!ids.length) return { sources: [], context: "Nessuna conoscenza pertinente trovata." };
  const items = await prisma.item.findMany({
    where: { userId, id: { in: ids }, archivedAt: null },
    select: { id: true, title: true, content: true, type: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  const sources = ids.flatMap((id) => {
    const item = byId.get(id);
    return item ? [itemSource(item)] : [];
  });
  return { sources, context: sources.length ? sources.map((source) => `- ${source.title}: ${source.excerpt}`).join("\n") : "Nessuna conoscenza pertinente trovata." };
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
  if (mode === "KNOWLEDGE") return { tools: [{ name: "search_knowledge", query: question, limit: 8 }] };
  if (mode === "WEB") return { tools: [webAllowed ? { name: "search_web", query: question } : { name: "respond" }] };
  if (mode === "COMBINED") return {
    tools: [
      { name: "search_knowledge", query: question, limit: 8 },
      ...(webAllowed ? [{ name: "search_web" as const, query: question }] : []),
    ],
  };
  return plan;
}

async function executeTools(args: {
  userId: string;
  question: string;
  plan: ToolPlan;
  webAllowed: boolean;
  activeProjectId?: string | null;
}) : Promise<ToolExecution> {
  const result: ToolExecution = { sources: [], context: [], activeProjectId: args.activeProjectId, used: new Set() };

  for (const tool of args.plan.tools.slice(0, MAX_TOOL_CALLS)) {
    result.used.add(tool.name);
    if (tool.name === "respond") continue;
    if (tool.name === "search_knowledge") {
      const knowledge = await searchKnowledge(args.userId, tool.query || args.question, clampLimit(tool.limit));
      result.sources.push(...knowledge.sources);
      result.context.push(`Conoscenze Synapse:\n${knowledge.context}`);
      continue;
    }
    if (tool.name === "list_items") {
      const catalog = await listItems(args.userId, validItemType(tool.itemType), clampLimit(tool.limit));
      result.sources.push(...catalog.sources);
      result.context.push(`Catalogo Synapse:\n${catalog.context}`);
      continue;
    }
    if (tool.name === "get_project" || tool.name === "get_relations") {
      const project = await resolveProject(args.userId, tool.project, result.activeProjectId);
      if (!project) {
        result.context.push("Il progetto richiesto non — stato identificato in modo univoco nell'account corrente.");
        continue;
      }
      result.activeProjectId = project.id;
      const context = await projectContext(args.userId, project);
      result.sources.push(...context.sources);
      result.context.push(`${tool.name === "get_relations" ? "Relazioni del progetto" : "Contesto del progetto"}:\n${context.context}`);
      continue;
    }
    if (tool.name === "search_web") {
      if (!args.webAllowed) {
        result.context.push("La ricerca Web non è autorizzata per questa richiesta.");
        continue;
      }
      // The only payload sent outside Synapse is the user's own question, never local context.
      const web = await searchWeb(args.question);
      result.sources.push(...web.map((item) => ({
        id: item.id,
        kind: "WEB" as const,
        title: item.title,
        excerpt: item.excerpt,
        href: item.url,
      })));
      result.context.push(web.length
        ? `Risultati Web verificati:\n${web.map((item) => `- ${item.title}: ${item.excerpt}\n  ${item.url}`).join("\n")}`
        : "La ricerca Web non ha restituito fonti sufficienti.");
      continue;
    }
    if (tool.name === "get_time") result.context.push(timeContext(validTimezone(tool.timezone)));
  }

  return { ...result, sources: uniqueSources(result.sources) };
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
    const webAllowed = Boolean(options.webSearch && webSearchConfig().enabled);
    const planned = await planTools(content, webAllowed, activeProject?.title);
    const plan = applyConversationMode(planned, conversation.mode as AiMode, content, webAllowed);
    const execution = await executeTools({
      userId: args.userId,
      question: content,
      plan,
      webAllowed,
      activeProjectId: activeProject?.id || null,
    });

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
    const historyRows = await prisma.aiMessage.findMany({
      where: { conversationId: conversation.id, id: { not: userMessage.id } },
      select: { role: true, content: true },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY_MESSAGES,
    });
    const history: ChatMessage[] = historyRows.reverse().map((message) => ({
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
    }));

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
  const [message] = await prisma.$transaction([
    prisma.aiMessage.create({
      data: {
        conversationId: args.conversationId,
        role: "ASSISTANT",
        content: args.content,
        sources: args.sources as unknown as Prisma.InputJsonValue,
      },
    }),
    prisma.aiConversation.update({ where: { id: args.conversationId }, data: { updatedAt: new Date() } }),
  ]);
  activeGeneration = false;
  return { message, sources: args.sources };
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

"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  ArrowUp,
  Brain,
  FileText,
  Globe2,
  Lightbulb,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { api, errorMessage } from "@/features/items/api";
import { Loading, Modal } from "@/components/ui";
import "./assistant.css";
type Source = {
  id: string;
  citation: string;
  title: string;
  type: string;
  excerpt: string;
  href: string;
  sourceKind?: "SYNAPSE" | "WEB";
};
type Msg = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sources?: Source[];
};
type Chat = {
  id: string;
  title: string;
  webSearchEnabled: boolean;
  reasoningEnabled: boolean;
  messages?: Msg[];
};
type State = {
  state: "ready" | "offline" | "disabled" | "model_missing";
  reasoningAvailable: boolean;
  web: { enabled: boolean; reachable: boolean };
};
type Generation = {
  conversationId: string;
  messageId: string;
  phase:
    | "preparing"
    | "searching_knowledge"
    | "searching_web"
    | "reasoning"
    | "generating";
};
const ideas = [
  {
    t: "Cerca nelle mie note",
    d: "Trova ciò che hai già salvato.",
    q: "Cerca nelle mie note ",
    i: Search,
  },
  {
    t: "Riassumi un progetto",
    d: "Metti a fuoco obiettivi e prossimi passi.",
    q: "Riassumi il progetto ",
    i: FileText,
  },
  {
    t: "Cerca sul Web",
    d: "Trova fonti aggiornate online.",
    q: "",
    i: Globe2,
    web: true,
  },
  {
    t: "Organizza un’idea",
    d: "Trasforma uno spunto in un piano.",
    q: "Aiutami a organizzare questa idea: ",
    i: Lightbulb,
  },
];
export function Assistant() {
  const [status, setStatus] = useState<State | null>(null),
    [chats, setChats] = useState<Chat[]>([]),
    [chat, setChat] = useState<Chat | null>(null),
    [text, setText] = useState(""),
    [web, setWeb] = useState(true),
    [think, setThink] = useState(false),
    [busy, setBusy] = useState(false),
    [generation, setGeneration] = useState<Generation | null>(null),
    [error, setError] = useState(""),
    [dialog, setDialog] = useState<"rename" | "delete" | null>(null),
    [titleDraft, setTitleDraft] = useState("");
  const input = useRef<HTMLTextAreaElement | null>(null),
    titleInput = useRef<HTMLInputElement | null>(null),
    messageEnd = useRef<HTMLDivElement | null>(null);
  const available = status?.state === "ready",
    webOK = !!status?.web.enabled && status.web.reachable;
  const load = async (id: string) => {
    const r = await api<{ conversation: Chat }>(`/api/ai/conversations/${id}`);
    setChat(r.conversation);
    setWeb(r.conversation.webSearchEnabled);
    setThink(r.conversation.reasoningEnabled);
  };
  const refresh = async () => {
    const [s, c] = await Promise.all([
      api<State>("/api/ai/status"),
      api<{ conversations: Chat[] }>("/api/ai/conversations"),
    ]);
    setStatus(s);
    setChats(c.conversations);
    return c.conversations;
  };
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
        .then((x) => x[0] && load(x[0].id))
        .catch((e) => setError(errorMessage(e)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [chat?.messages, generation]);
  const create = async () => {
    const r = await api<{ conversation: Chat }>("/api/ai/conversations", {
      method: "POST",
      body: JSON.stringify({ mode: "AUTO", webSearch: web, reasoning: think }),
    });
    setChats((x) => [r.conversation, ...x]);
    setChat({ ...r.conversation, messages: [] });
    return r.conversation;
  };
  const prefs = async (w: boolean, t: boolean) => {
    setWeb(w);
    setThink(t);
    if (chat)
      await api(`/api/ai/conversations/${chat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ webSearch: w, reasoning: t }),
      });
  };
  const openRename = () => {
    if (!chat || busy) return;
    setTitleDraft(chat.title);
    setDialog("rename");
  };
  const renameChat = async (event: FormEvent) => {
    event.preventDefault();
    if (!chat || busy) return;
    const title = titleDraft.trim();
    if (!title || title === chat.title) {
      if (title === chat.title) setDialog(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/api/ai/conversations/${chat.id}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setChat((current) => (current ? { ...current, title } : current));
      setChats((items) =>
        items.map((item) => (item.id === chat.id ? { ...item, title } : item)),
      );
      setDialog(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const deleteChat = async () => {
    if (!chat || busy) return;
    const id = chat.id;
    setBusy(true);
    setError("");
    try {
      await api(`/api/ai/conversations/${id}`, {
        method: "DELETE",
        body: "{}",
      });
      const remaining = chats.filter((item) => item.id !== id);
      setChats(remaining);
      setDialog(null);
      if (remaining[0]) await load(remaining[0].id);
      else setChat(null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim() || busy || !available) return;
    let pendingMessageId: string | null = null;
    setBusy(true);
    setError("");
    try {
      const active = chat ?? (await create());
      const q = text.trim();
      const userId = `u${Date.now()}`;
      const assistantId = `a${Date.now()}`;
      pendingMessageId = assistantId;
      setText("");
      setGeneration({
        conversationId: active.id,
        messageId: assistantId,
        phase: "preparing",
      });
      setChat((current) =>
        current && current.id === active.id
          ? {
              ...current,
              messages: [
                ...(current.messages ?? []),
                { id: userId, role: "USER", content: q },
                { id: assistantId, role: "ASSISTANT", content: "" },
              ],
            }
          : current,
      );
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: active.id,
          message: q,
          webSearch: web,
          reasoning: think,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Risposta non disponibile");
      const reader = res.body.getReader(),
        dec = new TextDecoder();
      let b = "",
        out = "",
        sources: Source[] = [];
      for (;;) {
        const c = await reader.read();
        if (c.done) break;
        b += dec.decode(c.value, { stream: true });
        const es = b.split("\n\n");
        b = es.pop() ?? "";
        for (const raw of es) {
          const d = JSON.parse(raw.replace(/^data:\s*/, ""));
          if (d.type === "status")
            setGeneration((current) =>
              current?.messageId === assistantId
                ? { ...current, phase: d.phase }
                : current,
            );
          if (d.type === "token") {
            out += d.token;
            setChat((current) =>
              current && current.id === active.id
                ? {
                    ...current,
                    messages: (current.messages ?? []).map((message) =>
                      message.id === assistantId
                        ? { ...message, content: out }
                        : message,
                    ),
                  }
                : current,
            );
          }
          if (d.type === "done") sources = d.sources ?? [];
          if (d.type === "error") throw new Error(d.error);
        }
      }
      setChat((v) =>
        v && v.id === active.id
          ? {
              ...v,
              messages: [
                ...(v.messages ?? []).map((message) =>
                  message.id === assistantId
                    ? { ...message, content: out, sources }
                    : message,
                ),
              ],
            }
          : v,
      );
      await refresh();
    } catch (e) {
      setText(text);
      setChat((current) =>
        current
          ? {
              ...current,
              messages: (current.messages ?? []).filter(
                (message) => message.id !== pendingMessageId,
              ),
            }
          : current,
      );
      setError(errorMessage(e));
    } finally {
      setGeneration(null);
      setBusy(false);
    }
  }
  if (!status) return <Loading label="Carico l’assistente..." />;
  const composer = (
    <form className="assistant-composer" onSubmit={send}>
      <textarea
        ref={input}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Chiedi a Synapse..."
        disabled={busy}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="assistant-composer-actions">
        <div className="assistant-toggles">
          <label className="assistant-think-toggle">
            <Globe2 size={14} />
            <span>Ricerca Web</span>
            <input
              type="checkbox"
              role="switch"
              checked={web}
              disabled={!webOK || busy}
              onChange={(e) => void prefs(e.target.checked, think)}
            />
          </label>
          <label className="assistant-think-toggle">
            <Brain size={14} />
            <span>Ragionamento</span>
            <input
              type="checkbox"
              role="switch"
              checked={think}
              disabled={!status.reasoningAvailable || busy}
              onChange={(e) => void prefs(web, e.target.checked)}
            />
          </label>
        </div>
        <button
          className="button button-primary"
          disabled={!text.trim() || busy}
          aria-label="Invia"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </form>
  );
  const dialogs = (
    <>
      <Modal
        open={dialog === "rename"}
        onOpenChange={(open) => !busy && setDialog(open ? "rename" : null)}
        title="Rinomina conversazione"
        description="Scegli un titolo chiaro per ritrovarla facilmente."
        initialFocusRef={titleInput}
      >
        <form className="assistant-dialog-form" onSubmit={renameChat}>
          <label htmlFor="assistant-chat-title">Titolo</label>
          <input
            ref={titleInput}
            id="assistant-chat-title"
            value={titleDraft}
            onChange={(event) => setTitleDraft(event.target.value)}
            maxLength={160}
            autoComplete="off"
          />
          <div className="dialog-footer">
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDialog(null)}
              disabled={busy}
            >
              Annulla
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={busy || !titleDraft.trim()}
            >
              Salva
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={dialog === "delete"}
        onOpenChange={(open) => !busy && setDialog(open ? "delete" : null)}
        title="Eliminare la conversazione?"
        description="Questa azione rimuoverà definitivamente la chat e tutti i suoi messaggi."
      >
        <div className="assistant-delete-summary">
          <Trash2 size={18} />
          <span>{chat?.title}</span>
        </div>
        <div className="dialog-footer">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => setDialog(null)}
            disabled={busy}
          >
            Annulla
          </button>
          <button
            type="button"
            className="button button-danger"
            onClick={() => void deleteChat()}
            disabled={busy}
          >
            {busy ? "Eliminazione..." : "Elimina"}
          </button>
        </div>
      </Modal>
    </>
  );
  return (
    <div className="page assistant-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Conoscenza locale, sempre privata</p>
          <h1>Assistente AI</h1>
        </div>
      </header>
      <div className="assistant-layout">
        <aside className="assistant-history">
          <button
            className="button button-primary"
            onClick={() => void create()}
          >
            <Plus size={16} />
            Nuova chat
          </button>
          <div className="assistant-history-list">
            {chats.map((c) => (
              <button
                key={c.id}
                className={chat?.id === c.id ? "active" : ""}
                onClick={() => void load(c.id)}
              >
                <Sparkles size={14} />
                <strong>{c.title}</strong>
              </button>
            ))}
            {!chats.length && (
              <small>Le tue conversazioni appariranno qui.</small>
            )}
          </div>
        </aside>
        <section className="assistant-chat">
          {chat ? (
            <>
              <div className="assistant-chat-head">
                <h2>{chat.title}</h2>
                <div className="assistant-chat-actions">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={openRename}
                    disabled={busy}
                    aria-label="Rinomina conversazione"
                    title="Rinomina conversazione"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => setDialog("delete")}
                    disabled={busy}
                    aria-label="Elimina conversazione"
                    title="Elimina conversazione"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <div className="assistant-messages">
                {chat.messages?.map((m) => (
                  <article
                    className={`assistant-message ${m.role.toLowerCase()}${generation?.messageId === m.id && !m.content ? " assistant-pending" : ""}`}
                    key={m.id}
                  >
                    <span>{m.role === "USER" ? "Tu" : "Synapse"}</span>
                    {generation?.messageId === m.id && !m.content ? (
                      <p>
                        {generation.phase === "searching_knowledge"
                          ? "Cerco nelle tue conoscenze"
                          : generation.phase === "searching_web"
                            ? "Cerco sul Web"
                            : generation.phase === "reasoning"
                              ? "Sto ragionando"
                              : generation.phase === "generating"
                                ? "Sto preparando la risposta"
                                : "Preparo la risposta"}
                        <i />
                      </p>
                    ) : (
                      <div className="assistant-markdown">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                          skipHtml
                          components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noreferrer">
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </article>
                ))}
                <div ref={messageEnd} />
              </div>
              {error && (
                <p className="form-error assistant-chat-error">{error}</p>
              )}
              {composer}
            </>
          ) : (
            <div className="assistant-empty">
              <div className="assistant-empty-content">
                <h2>Da dove vuoi iniziare?</h2>
                <p>
                  Esplora le tue conoscenze, sviluppa un’idea o fai una domanda.
                </p>
                <div className="assistant-empty-suggestions">
                  {ideas.map((x) => {
                    const Icon = x.i;
                    return (
                      <button
                        className="button button-secondary"
                        key={x.t}
                        onClick={() => {
                          if (x.web && webOK) setWeb(true);
                          setText(x.q);
                          input.current?.focus();
                        }}
                      >
                        <Icon size={17} />
                        <b>{x.t}</b>
                        <small>{x.d}</small>
                      </button>
                    );
                  })}
                </div>
                {error && <p className="form-error">{error}</p>}
              </div>
              {composer}
            </div>
          )}
        </section>
      </div>
      {dialogs}
    </div>
  );
}

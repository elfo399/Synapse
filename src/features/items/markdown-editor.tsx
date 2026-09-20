"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { Bold, Code, Columns2, Eye, Heading2, Italic, Link2, List, Pencil } from "lucide-react";
import { api } from "./api";
import type { ItemSummary, Relation } from "./types";

function withWikilinks(content: string, relations: Relation[]) {
  const lookup = new Map(relations.map(relation => [relation.target.title.toLocaleLowerCase(), relation.target.id]));
  return content.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)|\[\[([^\]\n]+)\]\]/g, (match, code: string | undefined, title: string | undefined) => {
    if (code || !title) return match;
    const [target, alias] = title.split("|");
    const normalized = target.trim();
    const id = lookup.get(normalized.toLocaleLowerCase());
    const label = (alias || normalized).replace(/[\[\]\\]/g, "\\$&");
    return `[${label}](${id ? `/items/${id}` : `#create=${encodeURIComponent(normalized)}`})`;
  });
}

export function MarkdownPreview({ content, relations = [], onCreate }: { content: string; relations?: Relation[]; onCreate?: (title: string) => void }) {
  return <div className="markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={{
    a: ({ href, children }) => href?.startsWith("#create=") ? <button type="button" className="wikilink-unresolved" title="Crea questa nota collegata" onClick={() => onCreate?.(decodeURIComponent(href.slice(8)))}>{children}<span> +</span></button> : <a href={href} {...(href?.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{children}</a>,
    img: ({ alt }) => <span className="external-image">[Immagine: {alt || "immagine esterna"}]</span>,
  }}>{withWikilinks(content, relations) || "*Le tue parole prenderanno forma qui.*"}</ReactMarkdown></div>;
}

export function MarkdownEditor({ content, onChange, relations, onCreate }: { content: string; onChange: (content: string) => void; relations: Relation[]; onCreate: (title: string) => void }) {
  const [mode, setMode] = useState<"write" | "split" | "preview">("split");
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ItemSummary[]>([]);
  const [cursor, setCursor] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (linkQuery === null) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => { api<{ items: ItemSummary[] }>(`/api/search?q=${encodeURIComponent(linkQuery)}&limit=5`, { signal: controller.signal }).then(result => setSuggestions(result.items)).catch(() => undefined); }, 160);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [linkQuery]);
  function wrap(before: string, after: string = before) {
    const area = editor.current; if (!area) return;
    const start = area.selectionStart, end = area.selectionEnd;
    const selected = content.slice(start, end) || "testo";
    onChange(content.slice(0, start) + before + selected + after + content.slice(end));
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start + before.length, start + before.length + selected.length); });
  }
  function update(value: string, caret: number) {
    onChange(value); setCursor(caret);
    const match = value.slice(0, caret).match(/\[\[([^\]\n]{0,60})$/);
    setLinkQuery(match ? match[1] : null);
  }
  function insertLink(title: string) {
    const start = content.slice(0, cursor).lastIndexOf("[[");
    if (start < 0) return;
    const value = content.slice(0, start) + `[[${title}]]` + content.slice(cursor);
    onChange(value); setLinkQuery(null);
    requestAnimationFrame(() => { editor.current?.focus(); editor.current?.setSelectionRange(start + title.length + 4, start + title.length + 4); });
  }
  return <div className="markdown-editor"><div className="editor-toolbar"><div className="editor-tools"><button type="button" className="icon-button" title="Grassetto" aria-label="Grassetto" onClick={() => wrap("**")}><Bold size={16} /></button><button type="button" className="icon-button" title="Corsivo" aria-label="Corsivo" onClick={() => wrap("*")}><Italic size={16} /></button><button type="button" className="icon-button" title="Intestazione" aria-label="Intestazione" onClick={() => wrap("\n## ", "\n")}><Heading2 size={17} /></button><span className="toolbar-divider" /><button type="button" className="icon-button" title="Codice" aria-label="Codice" onClick={() => wrap("` ".trim())}><Code size={17} /></button><button type="button" className="icon-button" title="Elenco" aria-label="Elenco" onClick={() => wrap("\n- ", "\n")}><List size={17} /></button><button type="button" className="icon-button" title="Collegamento interno" aria-label="Inserisci un collegamento interno" onClick={() => wrap("[[", "]]")}><Link2 size={17} /></button></div><div className="segmented-control" aria-label="Modalità di scrittura">{([{ value: "write", label: "Scrivi", icon: Pencil }, { value: "split", label: "Affianca", icon: Columns2 }, { value: "preview", label: "Anteprima", icon: Eye }] as const).map(option => <button type="button" className={mode === option.value ? "selected" : ""} aria-pressed={mode === option.value} key={option.value} onClick={() => setMode(option.value)}><option.icon size={13} /><span>{option.label}</span></button>)}</div></div>
    <div className={`editor-panes mode-${mode}`}>{mode !== "preview" && <div className="editor-write-pane"><label className="sr-only" htmlFor="item-content">Contenuto</label><textarea id="item-content" ref={editor} value={content} onChange={event => update(event.target.value, event.target.selectionStart)} onKeyDown={event => { if (event.key === "Escape") setLinkQuery(null); if (event.key === "Tab") { event.preventDefault(); const area = event.currentTarget; const start = area.selectionStart; onChange(content.slice(0, start) + "  " + content.slice(area.selectionEnd)); requestAnimationFrame(() => area.setSelectionRange(start + 2, start + 2)); } }} placeholder="Scrivi un’idea chiara. Usa [[doppie parentesi]] per collegarla a un’altra." spellCheck />{linkQuery !== null && <div className="wikilink-suggestions"><span className="subtle-label">COLLEGA UN’IDEA</span>{suggestions.map(item => <button type="button" key={item.id} onClick={() => insertLink(item.title)}><Link2 size={13} />{item.title}</button>)}<button type="button" onClick={() => insertLink(linkQuery || "Nuova nota")}>Usa [[{linkQuery || "Nuova nota"}]]</button></div>}</div>}{mode !== "write" && <MarkdownPreview content={content} relations={relations} onCreate={onCreate} />}</div><div className="editor-footer"><span>Supporta Markdown <span>·</span> [[collega le tue idee]]</span><span>{content.trim() ? content.trim().split(/\s+/).length : 0} parole</span></div>
  </div>;
}

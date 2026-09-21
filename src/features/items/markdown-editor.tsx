"use client";

import { getItemHref } from "@/domain/item-url";
import { ATTACHMENT_ACCEPT } from "@/domain/attachments";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  Bold,
  Code,
  Columns2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  Pencil,
  Plus,
  Paperclip,
} from "lucide-react";
import { api } from "./api";
import type { ItemSummary, Relation } from "./types";
import "./markdown-editor.css";

// A textarea has no DOM caret to anchor to. A short-lived, invisible mirror uses
// the same wrapping and typography to measure its caret without moving focus.
function positionWikilinkPopup(
  area: HTMLTextAreaElement,
  popup: HTMLDivElement,
) {
  const viewport = window.visualViewport;
  const viewportLeft = viewport?.offsetLeft ?? 0;
  const viewportTop = viewport?.offsetTop ?? 0;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const navigation = document
    .querySelector<HTMLElement>(".mobile-bottom-nav")
    ?.getBoundingClientRect();
  const upperBound = viewportTop + 12;
  const lowerBound =
    Math.min(
      viewportTop + viewportHeight,
      navigation?.height ? navigation.top : Infinity,
    ) - 12;
  const areaBox = area.getBoundingClientRect();
  if (
    areaBox.bottom <= upperBound ||
    areaBox.top >= lowerBound ||
    lowerBound - upperBound < 50
  ) {
    popup.hidden = true;
    return;
  }

  const computed = getComputedStyle(area);
  const mirror = document.createElement("div");
  Object.assign(mirror.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    visibility: "hidden",
    width: `${area.clientWidth}px`,
    boxSizing: "border-box",
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    font: computed.font,
    letterSpacing: computed.letterSpacing,
    padding: computed.padding,
    textIndent: computed.textIndent,
    tabSize: computed.tabSize,
  });
  mirror.textContent = area.value.slice(0, area.selectionStart);
  const marker = document.createElement("span");
  marker.textContent = "\u200b";
  mirror.append(marker);
  document.body.append(mirror);
  const lineHeight =
    parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.6;
  const caretTop = areaBox.top + marker.offsetTop - area.scrollTop;
  const caretLeft = areaBox.left + marker.offsetLeft - area.scrollLeft;
  mirror.remove();

  popup.hidden = false;
  const width = Math.min(440, area.clientWidth, viewportWidth - 24);
  popup.style.width = `${width}px`;
  const desiredHeight = Math.min(240, popup.scrollHeight + 2);
  const anchorTop = Math.max(
    upperBound,
    Math.min(caretTop, lowerBound - lineHeight),
  );
  const below = Math.max(0, lowerBound - anchorTop - lineHeight - 7);
  const above = Math.max(0, anchorTop - upperBound - 7);
  const openBelow = below >= desiredHeight || below >= above;
  const height = Math.min(desiredHeight, openBelow ? below : above);
  const leftBound = Math.max(viewportLeft + 12, areaBox.left);
  const rightBound = Math.min(viewportLeft + viewportWidth - 12, areaBox.right);
  popup.style.left = `${Math.max(viewportLeft + 12, Math.min(Math.max(caretLeft, leftBound), rightBound - width))}px`;
  popup.style.top = `${openBelow ? anchorTop + lineHeight + 7 : anchorTop - height - 7}px`;
  popup.style.maxHeight = `${height}px`;
}

function withWikilinks(content: string, relations: Relation[]) {
  const lookup = new Map(
    relations.map((relation) => [
      relation.target.title.toLocaleLowerCase(),
      relation.target,
    ]),
  );
  return content.replace(
    /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)|\[\[([^\]\n]+)\]\]/g,
    (match, code: string | undefined, title: string | undefined) => {
      if (code || !title) return match;
      const [target, alias] = title.split("|");
      const normalized = target.trim();
      const linked = lookup.get(normalized.toLocaleLowerCase());
      const label = (alias || normalized).replace(/[\[\]\\]/g, "\\$&");
      return `[${label}](${linked ? getItemHref(linked) : `#create=${encodeURIComponent(normalized)}`})`;
    },
  );
}

export function MarkdownPreview({
  content,
  relations = [],
  onCreate,
}: {
  content: string;
  relations?: Relation[];
  onCreate?: (title: string) => void;
}) {
  return (
    <div className="markdown-preview">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith("#create=") ? (
              <button
                type="button"
                className="wikilink-unresolved"
                title="Crea questa nota collegata"
                onClick={() => onCreate?.(decodeURIComponent(href.slice(8)))}
              >
                {children}
                <span> +</span>
              </button>
            ) : (
              <a
                href={href}
                {...(href?.startsWith("http")
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
              >
                {children}
              </a>
            ),
          img: ({ alt, src }) =>
            typeof src === "string" &&
            /^\/api\/attachments\/[a-zA-Z0-9_-]+$/.test(src) ? (
              // Authenticated, same-origin images only; never send private files through the public optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={src}
                alt={alt || "Allegato"}
                className="attachment-inline-image"
                loading="lazy"
              />
            ) : (
              <span className="external-image">
                [Immagine: {alt || "immagine esterna"}]
              </span>
            ),
        }}
      >
        {withWikilinks(content, relations) || "*La nota è ancora vuota.*"}
      </ReactMarkdown>
    </div>
  );
}

export function MarkdownEditor({
  content,
  onChange,
  relations,
  onCreate,
  onUpload,
}: {
  content: string;
  onChange: (content: string) => void;
  relations: Relation[];
  onCreate: (title: string) => void;
  onUpload?: (files: File[]) => Promise<string>;
}) {
  const uploadInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const latestContent = useRef(content);
  useLayoutEffect(() => {
    latestContent.current = content;
  }, [content]);
  async function attach(files: File[]) {
    if (!onUpload || !files.length || uploading) return;
    const start = editor.current?.selectionStart ?? content.length;
    const snapshot = content;
    setUploading(true);
    try {
      const markdown = await onUpload(files);
      // Preserve edits made while the upload was in flight.
      const current = latestContent.current;
      onChange(
        current === snapshot
          ? `${current.slice(0, start)}\n${markdown}\n${current.slice(start)}`
          : `${current}\n\n${markdown}`,
      );
    } finally {
      setUploading(false);
    }
  }
  const [mode, setMode] = useState<"write" | "split" | "preview">("write");
  const [linkQuery, setLinkQuery] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<ItemSummary[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [cursor, setCursor] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  const popup = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (linkQuery === null || !linkQuery.trim()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      api<{ items: ItemSummary[] }>(
        `/api/search?q=${encodeURIComponent(linkQuery)}&limit=5`,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setSuggestions(result.items);
            setSelectedSuggestion(0);
          }
        })
        .catch(() => undefined);
    }, 160);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [linkQuery]);
  useEffect(() => {
    const list = popup.current;
    const active = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !active) return;
    if (active.offsetTop < list.scrollTop) list.scrollTop = active.offsetTop;
    if (
      active.offsetTop + active.offsetHeight >
      list.scrollTop + list.clientHeight
    ) {
      list.scrollTop =
        active.offsetTop + active.offsetHeight - list.clientHeight;
    }
  }, [selectedSuggestion, suggestions]);
  useLayoutEffect(() => {
    const area = editor.current;
    if (!area) return;
    const scrollTop = area.scrollTop;
    area.style.height = "auto";
    area.style.height = `${Math.min(Math.max(area.scrollHeight, 300), 1600)}px`;
    area.scrollTop = scrollTop;
  }, [content, mode]);
  useLayoutEffect(() => {
    const area = editor.current;
    const list = popup.current;
    if (linkQuery === null || !area || !list) return;
    let frame = 0;
    const position = () => positionWikilinkPopup(area, list);
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    position();
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [linkQuery, cursor, content, mode, suggestions]);

  function wrap(before: string, after: string = before) {
    const area = editor.current;
    if (!area) return;
    const start = area.selectionStart,
      end = area.selectionEnd;
    const selected = content.slice(start, end) || "testo";
    onChange(
      content.slice(0, start) + before + selected + after + content.slice(end),
    );
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }
  function updateCaret(value: string, caret: number) {
    setCursor(caret);
    const match = value.slice(0, caret).match(/\[\[([^\]\n]{0,60})$/);
    const next = match ? match[1] : null;
    if (next !== linkQuery) {
      setLinkQuery(next);
      setSuggestions([]);
      setSelectedSuggestion(0);
    }
  }
  function insertLink(title: string) {
    const start = content.slice(0, cursor).lastIndexOf("[[");
    if (start < 0) return;
    const suffix = content.slice(cursor).startsWith("]]")
      ? content.slice(cursor + 2)
      : content.slice(cursor);
    onChange(content.slice(0, start) + `[[${title}]]` + suffix);
    setLinkQuery(null);
    setSuggestions([]);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(
        start + title.length + 4,
        start + title.length + 4,
      );
    });
  }
  const fallbackTitle = linkQuery?.trim() || "Nuova nota";
  const activeSuggestion = Math.min(selectedSuggestion, suggestions.length);

  return (
    <div className={`markdown-editor editor-mode-${mode}`}>
      <div className="editor-toolbar">
        <div className="editor-tools" aria-label="Formattazione Markdown">
          {onUpload && (
            <>
              <button
                type="button"
                className="icon-button"
                aria-label="Allega un file al contenuto"
                disabled={uploading || mode === "preview"}
                onClick={() => uploadInput.current?.click()}
              >
                <Paperclip size={15} />
              </button>
              <input
                ref={uploadInput}
                className="sr-only"
                tabIndex={-1}
                type="file"
                multiple
                accept={ATTACHMENT_ACCEPT}
                aria-label="Allegati del contenuto"
                onChange={(event) => {
                  void attach(Array.from(event.target.files || [])).catch(
                    () => {},
                  );
                  event.target.value = "";
                }}
              />
            </>
          )}
          <button
            type="button"
            className="icon-button"
            title="Grassetto"
            aria-label="Grassetto"
            disabled={mode === "preview"}
            onClick={() => wrap("**")}
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Corsivo"
            aria-label="Corsivo"
            disabled={mode === "preview"}
            onClick={() => wrap("*")}
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Intestazione"
            aria-label="Intestazione"
            disabled={mode === "preview"}
            onClick={() => wrap("\n## ", "\n")}
          >
            <Heading2 size={16} />
          </button>
          <span className="toolbar-divider" />
          <button
            type="button"
            className="icon-button"
            title="Codice"
            aria-label="Codice"
            disabled={mode === "preview"}
            onClick={() => wrap("`")}
          >
            <Code size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Elenco"
            aria-label="Elenco"
            disabled={mode === "preview"}
            onClick={() => wrap("\n- ", "\n")}
          >
            <List size={16} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Collegamento interno"
            aria-label="Inserisci un collegamento interno"
            disabled={mode === "preview"}
            onClick={() => wrap("[[", "]]")}
          >
            <Link2 size={16} />
          </button>
        </div>
        <div
          className="editor-mode-control"
          role="group"
          aria-label="Modalità di scrittura"
        >
          {(
            [
              { value: "write", label: "Scrivi", icon: Pencil },
              { value: "split", label: "Affianca", icon: Columns2 },
              { value: "preview", label: "Anteprima", icon: Eye },
            ] as const
          ).map((option) => (
            <button
              type="button"
              className={mode === option.value ? "selected" : ""}
              aria-pressed={mode === option.value}
              key={option.value}
              onClick={() => {
                setMode(option.value);
                setLinkQuery(null);
              }}
            >
              <option.icon size={13} />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={`editor-panes mode-${mode}`}>
        {mode !== "preview" && (
          <div className="editor-write-pane">
            <label className="sr-only" htmlFor="item-content">
              Contenuto
            </label>
            <textarea
              id="item-content"
              ref={editor}
              onPaste={(event) => {
                if (onUpload && event.clipboardData.files.length) {
                  event.preventDefault();
                  void attach(Array.from(event.clipboardData.files)).catch(
                    () => {},
                  );
                }
              }}
              onDragOver={(event) => {
                if (onUpload) event.preventDefault();
              }}
              onDrop={(event) => {
                if (onUpload && event.dataTransfer.files.length) {
                  event.preventDefault();
                  void attach(Array.from(event.dataTransfer.files)).catch(
                    () => {},
                  );
                }
              }}
              value={content}
              aria-autocomplete="list"
              aria-controls={
                linkQuery !== null ? "wikilink-suggestions" : undefined
              }
              aria-activedescendant={
                linkQuery !== null
                  ? `wiki-suggestion-${activeSuggestion}`
                  : undefined
              }
              onChange={(event) => {
                onChange(event.target.value);
                updateCaret(event.target.value, event.target.selectionStart);
              }}
              onSelect={(event) =>
                updateCaret(
                  event.currentTarget.value,
                  event.currentTarget.selectionStart,
                )
              }
              onBlur={() => setLinkQuery(null)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (linkQuery !== null) {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setLinkQuery(null);
                    return;
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setSelectedSuggestion((value) =>
                      Math.min(value + 1, suggestions.length),
                    );
                    return;
                  }
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setSelectedSuggestion((value) => Math.max(value - 1, 0));
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    insertLink(
                      suggestions[activeSuggestion]?.title || fallbackTitle,
                    );
                    return;
                  }
                  if (event.key === "Tab") setLinkQuery(null);
                }
                if (
                  (event.ctrlKey || event.metaKey) &&
                  ["b", "i"].includes(event.key.toLowerCase())
                ) {
                  event.preventDefault();
                  wrap(event.key.toLowerCase() === "b" ? "**" : "*");
                }
              }}
              placeholder="Scrivi qui. Usa [[titolo]] per collegare una nota."
              spellCheck
            />
            {linkQuery !== null && (
              <div
                ref={popup}
                id="wikilink-suggestions"
                role="listbox"
                aria-label="Note da collegare"
                className="wikilink-suggestions"
              >
                <span className="wiki-popup-label">
                  Collega una nota{" "}
                  <small>↑ ↓ per scegliere · ↵ per inserire</small>
                </span>
                {suggestions.map((item, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={activeSuggestion === index}
                    id={`wiki-suggestion-${index}`}
                    tabIndex={-1}
                    key={item.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseMove={() => setSelectedSuggestion(index)}
                    onClick={() => insertLink(item.title)}
                  >
                    <Link2 size={14} />
                    <span>{item.title}</span>
                  </button>
                ))}
                <button
                  type="button"
                  role="option"
                  aria-selected={activeSuggestion === suggestions.length}
                  id={`wiki-suggestion-${suggestions.length}`}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseMove={() => setSelectedSuggestion(suggestions.length)}
                  onClick={() => insertLink(fallbackTitle)}
                >
                  <Plus size={14} />
                  <span>Usa [[{fallbackTitle}]]</span>
                </button>
              </div>
            )}
          </div>
        )}
        {mode !== "write" && (
          <MarkdownPreview
            content={content}
            relations={relations}
            onCreate={onCreate}
          />
        )}
      </div>
      <div className="editor-footer">
        <span>
          Markdown <span>·</span> [[collegamenti]]
        </span>
        <span>
          {content.trim() ? content.trim().split(/\s+/).length : 0} parole
        </span>
      </div>
    </div>
  );
}

"use client";

import { AppSelect } from "@/components/select";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCheck,
  ExternalLink,
  LoaderCircle,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { ErrorState, Loading, Modal, TypeBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import {
  typeRoutes,
  typePluralLabels,
  dateLabel,
  itemTypes,
  statusLabels,
  statusesFor,
  typeLabels,
  type ItemDetail as ItemDetailType,
  type ItemType,
} from "./types";
import { useRemote } from "./use-remote";
import { MarkdownEditor } from "./markdown-editor";
import { RelationsPanel } from "./relations-panel";
import "./document.css";

export function ItemDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useRemote<{ item: ItemDetailType }>(
    `/api/items/${id}`,
  );
  if (error)
    return (
      <div className="page">
        <ErrorState message={error} retry={reload} />
      </div>
    );
  if (loading || !data) return <Loading />;
  return <ItemEditor key={data.item.id} item={data.item} reload={reload} />;
}

function ItemEditor({
  item,
  reload,
}: {
  item: ItemDetailType;
  reload: () => void;
}) {
  const router = useRouter();
  const { notify } = useWorkspace();
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [type, setType] = useState(item.type);
  const [status, setStatus] = useState<string>(item.status);
  const [tags, setTags] = useState(item.tags.map((tag) => tag.name).join(", "));
  const [url, setUrl] = useState(item.url || "");
  const [dueAt, setDueAt] = useState(item.dueAt?.slice(0, 10) || "");
  const [version, setVersion] = useState(item.version);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [createTitle, setCreateTitle] = useState<string | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(
    item.inbox || ["TASK", "PROJECT"].includes(item.type),
  );
  const titleInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const area = titleInput.current;
    if (!area) return;
    let frame = 0;
    let width = area.getBoundingClientRect().width;
    const resize = () => {
      area.style.height = "auto";
      area.style.height = `${area.scrollHeight}px`;
    };
    const scheduleResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    };
    // The shell can finish its responsive layout after the window resize event.
    // Observe the final width too, without reacting to our own height changes.
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) {
        width = entry.contentRect.width;
        scheduleResize();
      }
    });
    resize();
    scheduleResize();
    observer.observe(area);
    window.addEventListener("resize", scheduleResize);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleResize);
    };
  }, [title]);
  const dirty =
    title !== item.title ||
    content !== item.content ||
    type !== item.type ||
    status !== item.status ||
    tags !== item.tags.map((tag) => tag.name).join(", ") ||
    url !== (item.url || "") ||
    dueAt !== (item.dueAt?.slice(0, 10) || "");
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function save(process = false) {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ item: ItemDetailType }>(
        `/api/items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            title,
            content,
            type,
            status,
            tags: tags
              .split(",")
              .map((value) => value.trim())
              .filter(Boolean),
            url: type === "BOOKMARK" ? url : null,
            dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null,
            version,
            ...(process ? { inbox: false } : {}),
          }),
        },
      );
      setVersion(result.item.version);
      setTags(result.item.tags.map((tag) => tag.name).join(", "));
      changed();
      reload();
      notify(
        process
          ? "Elemento organizzato. Un po’ più di chiarezza."
          : "Modifiche salvate.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ item: ItemDetailType }>(
        `/api/items/${item.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ archived: !item.archivedAt }),
        },
      );
      setVersion(result.item.version);
      changed();
      reload();
      notify(
        item.archivedAt
          ? "Elemento ripristinato."
          : "Elemento archiviato. Lo ritroverai quando ti servirà.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/items/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({ confirmTitle: confirmation }),
      });
      changed();
      notify("Elemento eliminato definitivamente.");
      router.push("/archive");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function createLinked() {
    if (!createTitle) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/items", {
        method: "POST",
        body: JSON.stringify({ title: createTitle, type: "NOTE", inbox: true }),
      });
      setCreateTitle(null);
      changed();
      reload();
      notify(
        "Nota collegata creata tra gli elementi da organizzare. Salva il contenuto per collegarla.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className="page document-page"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "s" &&
          event.currentTarget.contains(event.target as Node)
        ) {
          event.preventDefault();
          if (!busy && title.trim() && dirty) void save();
        }
      }}
    >
      <div className="document-topline">
        <Link
          href={item.inbox ? "/inbox" : typeRoutes[item.type]}
          className="text-link"
        >
          <ArrowLeft size={14} />
          {item.inbox
            ? "Torna agli elementi da organizzare"
            : `Vedi ${typePluralLabels[item.type].toLocaleLowerCase("it-IT")}`}
        </Link>
        <div className="document-actions">
          <span
            className={`save-indicator ${dirty ? "unsaved" : ""}`}
            role="status"
          >
            {dirty ? (
              "Modifiche non salvate"
            ) : (
              <>
                <Check size={12} />
                Tutte le modifiche salvate
              </>
            )}
          </span>
          <button
            className="button button-secondary compact"
            disabled={busy || !title.trim() || !dirty}
            onClick={() => save()}
          >
            {busy ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Save size={14} />
            )}
            Salva modifiche
          </button>
        </div>
      </div>
      {item.inbox && (
        <div className="document-processing">
          <span>Da organizzare</span>
          <button
            className="text-link"
            disabled={busy || !title.trim()}
            onClick={() => save(true)}
          >
            <CheckCheck size={15} />
            Segna come organizzato
          </button>
        </div>
      )}
      {item.archivedAt && (
        <div className="document-archive">
          <Archive size={16} />
          <span>Questo elemento è archiviato.</span>
          <button className="text-link" disabled={busy} onClick={archive}>
            <RotateCcw size={14} />
            Ripristina
          </button>
        </div>
      )}
      {error && (
        <p className="form-error document-error" role="alert">
          {error}
        </p>
      )}
      <article className="document-main">
        <header className="document-title-area">
          <div className="document-meta">
            <TypeBadge type={type} />
            <span>Modificato {dateLabel(item.updatedAt)}</span>
          </div>
          <label className="sr-only" htmlFor="item-title">
            Titolo
          </label>
          <textarea
            ref={titleInput}
            id="item-title"
            className="document-title-input"
            rows={1}
            value={title}
            onChange={(event) =>
              setTitle(event.target.value.replace(/[\r\n]+/g, " "))
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                document.getElementById("item-content")?.focus();
              }
            }}
            maxLength={200}
            placeholder="Una nuova idea"
            required
          />
          {item.tags.length > 0 && (
            <div className="document-tags">
              {item.tags.map((tag) => (
                <Link
                  className="tag"
                  href={`/tags?tag=${encodeURIComponent(tag.name)}`}
                  key={tag.id}
                >
                  #{tag.name}
                </Link>
              ))}
            </div>
          )}
        </header>
        {item.url && (
          <a
            className="document-bookmark"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={15} />
            <span>{item.url}</span>
          </a>
        )}
        <MarkdownEditor
          content={content}
          onChange={setContent}
          relations={item.outgoing}
          onCreate={setCreateTitle}
        />
        {item.unresolvedWikilinks.length > 0 && (
          <section className="document-unresolved">
            <h2>Note da creare</h2>
            <div>
              {item.unresolvedWikilinks.map((value) => (
                <button
                  key={value}
                  className="text-link"
                  onClick={() => setCreateTitle(value)}
                >
                  <Plus size={13} />
                  {value}
                </button>
              ))}
            </div>
          </section>
        )}
        <RelationsPanel item={item} onReload={reload} />
        <details
          className="document-properties"
          open={propertiesOpen}
          onToggle={(event) => setPropertiesOpen(event.currentTarget.open)}
        >
          <summary>
            <SlidersHorizontal size={14} />
            <span>Proprietà</span>
            <small>Tipo, etichette e dettagli</small>
          </summary>
          <div className="document-property-fields">
            <label>
              Tipo di elemento
              <AppSelect
                aria-label="Tipo di elemento"
                value={type}
                onValueChange={(nextValue) => {
                  const next = nextValue as ItemType;
                  setType(next);
                  setStatus(statusesFor(next)[0]);
                }}
                options={itemTypes.map((value) => ({
                  value,
                  label: typeLabels[value],
                }))}
              />
            </label>
            {["TASK", "PROJECT"].includes(type) && (
              <label>
                Stato
                <AppSelect
                  aria-label="Stato"
                  value={status}
                  onValueChange={setStatus}
                  options={statusesFor(type).map((value) => ({
                    value,
                    label: statusLabels[value],
                  }))}
                />
              </label>
            )}
            <label className="document-tag-field">
              Etichette
              <input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="idee, lavoro, letture"
              />
              <span className="field-hint">Separate da una virgola.</span>
            </label>
            {type === "BOOKMARK" && (
              <label className="document-url-field">
                URL del preferito
                <input
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://example.com"
                />
              </label>
            )}
            {type === "TASK" && (
              <label>
                Scadenza
                <input
                  type="date"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
              </label>
            )}
          </div>
          <p className="document-created">
            Creato il {dateLabel(item.createdAt)}
          </p>
        </details>
        <footer className="document-management">
          <button className="text-link" disabled={busy} onClick={archive}>
            {item.archivedAt ? <RotateCcw size={14} /> : <Archive size={14} />}
            {item.archivedAt ? "Ripristina elemento" : "Archivia elemento"}
          </button>
          <button
            className="text-link document-delete"
            disabled={busy}
            onClick={() => {
              setConfirmation("");
              setDeleteOpen(true);
            }}
          >
            <Trash2 size={14} />
            Elimina definitivamente
          </button>
        </footer>
      </article>
      <Modal
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminare definitivamente questo elemento?"
        description="L’elemento e i suoi collegamenti saranno eliminati. L’operazione è irreversibile. Puoi archiviarlo se vuoi conservarlo."
      >
        <label>
          Digita <strong>{item.title}</strong> per confermare
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            aria-label="Conferma il titolo dell’elemento"
            placeholder="Titolo esatto dell’elemento"
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button
            className="button button-secondary"
            onClick={() => setDeleteOpen(false)}
          >
            Conserva elemento
          </button>
          <button
            className="button button-danger"
            disabled={busy || confirmation !== item.title}
            onClick={remove}
          >
            <Trash2 size={15} />
            Elimina definitivamente
          </button>
        </div>
      </Modal>
      <Modal
        open={createTitle !== null}
        onOpenChange={(open) => {
          if (!open) setCreateTitle(null);
        }}
        title="Crea una nota collegata"
        description="La nuova nota verrà aggiunta agli elementi da organizzare."
      >
        <p className="linked-create-title">{createTitle}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button
            className="button button-secondary"
            onClick={() => setCreateTitle(null)}
          >
            Annulla
          </button>
          <button
            className="button button-primary"
            disabled={busy}
            onClick={createLinked}
          >
            <Plus size={15} />
            Crea nota collegata
          </button>
        </div>
      </Modal>
    </div>
  );
}

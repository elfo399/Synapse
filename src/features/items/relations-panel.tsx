"use client";

import { getItemHref } from "@/domain/item-url";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Link2,
  LoaderCircle,
  Network,
  Plus,
  Search,
  Unlink,
} from "lucide-react";
import { Modal, TypeIcon } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import { type ItemDetail, type ItemSummary, type Relation } from "./types";
import "./relations.css";

export function RelationsPanel({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const { notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const outgoing = item.outgoing.filter(
    (relation) => relation.relationType !== "PARENT",
  );

  useEffect(() => {
    if (!open || !query.trim()) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      api<{ items: ItemSummary[] }>(
        `/api/search?q=${encodeURIComponent(query)}&limit=20`,
        { signal: controller.signal },
      )
        .then((result) => {
          if (!controller.signal.aborted)
            setResults(result.items.filter((value) => value.id !== item.id));
        })
        .catch((error) => {
          if (!controller.signal.aborted) setError(errorMessage(error));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, item.id]);

  function openRelation() {
    setQuery("");
    setResults([]);
    setError("");
    setLoading(false);
    setOpen(true);
  }
  async function add(targetItemId: string) {
    setBusy(true);
    setError("");
    try {
      await api("/api/relations", {
        method: "POST",
        body: JSON.stringify({
          sourceItemId: item.id,
          targetItemId,
          relationType: "RELATED",
        }),
      });
      onReload();
      changed();
      setOpen(false);
      notify("Nuovo collegamento creato.");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await api("/api/relations", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      onReload();
      changed();
      notify("Collegamento manuale rimosso.");
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  function relationRow(relation: Relation) {
    const related = relation.target;
    return (
      <div className="document-relation-row" key={relation.id}>
        <TypeIcon type={related.type} size={15} />
        <Link href={getItemHref(related)}>
          <span>{related.title}</span>
          {related.archivedAt && <small>Archiviato</small>}
        </Link>
        {relation.manual && (
          <button
            className="icon-button relation-remove"
            aria-label={`Rimuovi il collegamento a ${related.title}`}
            title={
              relation.wikilink
                ? "Rimuovi il collegamento manuale; quello interno rimane nel contenuto"
                : "Rimuovi collegamento"
            }
            onClick={() => remove(relation.id)}
          >
            <Unlink size={13} />
          </button>
        )}
        {
          <small className="document-relation-kind">
            {relation.wikilink ? "Nel testo" : "Collegamento manuale"}
          </small>
        }
      </div>
    );
  }

  return (
    <>
      <section
        className="document-connections detail-card"
        id="collegamenti"
        aria-labelledby="document-connections-heading"
      >
        <div className="document-connections-heading">
          <h2 id="document-connections-heading">
            <Link2 size={16} />
            Conoscenze collegate
          </h2>
          <button
            className="text-link"
            aria-label="Aggiungi collegamento"
            onClick={openRelation}
          >
            <Plus size={14} />
            Collega
          </button>
        </div>
        <p className="document-connections-description">
          Conoscenze richiamate o collegate da questo elemento.
        </p>
        {outgoing.length ? (
          <div className="document-relation-list">
            {outgoing.map(relationRow)}
          </div>
        ) : (
          <p className="document-relation-empty">
            Nessuna conoscenza collegata. Usa <code>[[titolo]]</code> nel
            contenuto oppure Collega per aggiungerne una.
          </p>
        )}
        <div className="document-connection-actions">
          <Link className="text-link" href={`/graph?focus=${item.id}`}>
            <Network size={14} />
            Esplora i collegamenti vicini
            <ArrowUpRight size={12} />
          </Link>
        </div>
      </section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        initialFocusRef={searchInput}
        title="Crea un collegamento"
        description="Trova una conoscenza da collegare a questo elemento."
      >
        <div className="relation-dialog-body">
          <div className="relation-dialog-search">
            <Search size={16} />
            <input
              ref={searchInput}
              aria-label="Trova un elemento da collegare"
              placeholder="Cerca un elemento…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
                setError("");
                setLoading(Boolean(event.target.value.trim()));
              }}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="connection-results">
            {loading ? (
              <p role="status">Ricerca…</p>
            ) : (
              results.map((result) => (
                <button
                  className="connection-result"
                  key={result.id}
                  disabled={busy}
                  onClick={() => add(result.id)}
                >
                  <TypeIcon type={result.type} />
                  <span>{result.title}</span>
                  {busy ? (
                    <LoaderCircle size={14} className="spin" />
                  ) : (
                    <Plus size={15} />
                  )}
                </button>
              ))
            )}
            {!loading && !error && !results.length && (
              <p>
                {query.trim()
                  ? "Nessun elemento corrispondente."
                  : "Scrivi il titolo dell’elemento da collegare."}
              </p>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

const allowedContextTypes: Record<string, string[]> = {
  AREA: [],
  PROJECT: ["AREA"],
  RESOURCE: ["PROJECT", "AREA", "RESOURCE"],
  TASK: ["PROJECT", "AREA"],
  BOOKMARK: ["PROJECT", "AREA", "RESOURCE"],
};

export function OrganizationPanel({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const { notify } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [makePrimary, setMakePrimary] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const contexts = item.outgoing.filter(
    (relation) => relation.relationType === "PARENT",
  );
  const primary =
    contexts.find((relation) => relation.isPrimary) ?? contexts[0];
  const secondary = contexts.filter((relation) => relation.id !== primary?.id);

  useEffect(() => {
    if (!open || !query.trim()) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      api<{ items: ItemSummary[] }>(
        `/api/search?q=${encodeURIComponent(query)}&limit=20`,
        { signal: controller.signal },
      ).then((result) => {
        if (!controller.signal.aborted)
          setResults(
            result.items.filter(
              (candidate) =>
                candidate.id !== item.id &&
                allowedContextTypes[item.type].includes(candidate.type),
            ),
          );
      });
    }, 150);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [item.id, item.type, open, query]);

  function chooseContext(primaryContext: boolean) {
    setMakePrimary(primaryContext);
    setQuery("");
    setResults([]);
    setOpen(true);
  }
  async function addContext(targetItemId: string) {
    setBusy(true);
    try {
      const created = await api<{ relation: Relation }>("/api/relations", {
        method: "POST",
        body: JSON.stringify({
          sourceItemId: item.id,
          targetItemId,
          relationType: "PARENT",
        }),
      });
      if (makePrimary)
        await api("/api/relations", {
          method: "PATCH",
          body: JSON.stringify({ id: created.relation.id, primary: true }),
        });
      setOpen(false);
      onReload();
      changed();
      notify(
        makePrimary
          ? "Contenitore principale aggiornato."
          : "Contesto aggiunto.",
      );
    } catch (cause) {
      notify(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="detail-card detail-context"
        aria-labelledby="context-heading"
      >
        <h2 id="context-heading">Organizzazione</h2>
        {primary ? (
          <>
            <p className="detail-context-label">Contenitore principale</p>
            <Link href={getItemHref(primary.target)}>
              <TypeIcon type={primary.target.type} size={15} />
              <span>{primary.target.title}</span>
            </Link>
          </>
        ) : (
          <p className="detail-empty">Nessun contenitore assegnato.</p>
        )}
        {secondary.length > 0 && (
          <div className="detail-secondary-contexts">
            <p className="detail-context-label">Altri contesti</p>
            {secondary.map((relation) => (
              <Link href={getItemHref(relation.target)} key={relation.id}>
                <TypeIcon type={relation.target.type} size={15} />
                <span>{relation.target.title}</span>
              </Link>
            ))}
          </div>
        )}
        {allowedContextTypes[item.type].length > 0 && (
          <div className="detail-context-actions">
            <button className="text-link" onClick={() => chooseContext(true)}>
              <Plus size={13} />
              Cambia contenitore
            </button>
            <button className="text-link" onClick={() => chooseContext(false)}>
              <Plus size={13} />
              Aggiungi contesto
            </button>
          </div>
        )}
      </section>
      <Modal
        open={open}
        onOpenChange={setOpen}
        initialFocusRef={input}
        title={makePrimary ? "Cambia contenitore" : "Aggiungi contesto"}
        description="Scegli dove organizzare questo elemento."
      >
        <div className="relation-dialog-body">
          <div className="relation-dialog-search">
            <Search size={16} />
            <input
              ref={input}
              aria-label="Cerca un contenitore"
              placeholder="Cerca un progetto, un’area o una risorsa…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setResults([]);
              }}
            />
          </div>
          <div className="connection-results">
            {results.map((result) => (
              <button
                className="connection-result"
                key={result.id}
                disabled={busy}
                onClick={() => void addContext(result.id)}
              >
                <TypeIcon type={result.type} />
                <span>{result.title}</span>
                <Plus size={15} />
              </button>
            ))}
            {!results.length && <p>Scrivi il nome del contenitore.</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}

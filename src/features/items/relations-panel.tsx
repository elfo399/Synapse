"use client";

import { getItemHref } from "@/domain/item-url";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Link2,
  LoaderCircle,
  Network,
  Plus,
  Search,
  Unlink,
} from "lucide-react";
import { AppSelect } from "@/components/select";
import { Modal, TypeIcon } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import type { RelationType } from "@/domain/types";
import { api, changed, errorMessage } from "./api";
import {
  itemTypes,
  relationLabels,
  typePluralLabels,
  type ItemDetail,
  type ItemSummary,
  type Relation,
} from "./types";
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
  const [relationType, setRelationType] = useState<RelationType>("RELATED");
  const [results, setResults] = useState<ItemSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const isCollection = ["PROJECT", "AREA", "RESOURCE"].includes(item.type);
  const organized = isCollection
    ? item.incoming.filter((relation) => relation.relationType === "PARENT")
    : [];
  const incoming = item.incoming.filter(
    (relation) => !isCollection || relation.relationType !== "PARENT",
  );
  const contexts = item.outgoing.filter(
    (relation) => relation.relationType === "PARENT",
  );
  const primaryContext =
    contexts.find((relation) => relation.isPrimary) ?? contexts[0];
  const secondaryContexts = contexts.filter(
    (relation) => relation.id !== primaryContext?.id,
  );
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
            setResults(
              result.items.filter(
                (value) =>
                  value.id !== item.id &&
                  (relationType !== "PARENT" ||
                    (
                      {
                        AREA: [],
                        PROJECT: ["AREA"],
                        RESOURCE: ["PROJECT", "AREA"],
                        NOTE: ["PROJECT", "AREA", "RESOURCE"],
                        TASK: ["PROJECT", "AREA"],
                        BOOKMARK: ["PROJECT", "AREA", "RESOURCE"],
                      }[item.type] as string[]
                    ).includes(value.type)),
              ),
            );
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
  }, [open, query, item.id, item.type, relationType]);

  function openRelation(type: RelationType) {
    setRelationType(type);
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
          relationType,
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
  async function makePrimary(id: string) {
    setBusy(true);
    try {
      await api("/api/relations", {
        method: "PATCH",
        body: JSON.stringify({ id, primary: true }),
      });
      changed();
      onReload();
      notify("Contenitore principale aggiornato.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  function relationRow(relation: Relation, direction: "incoming" | "outgoing") {
    const related =
      direction === "incoming" ? relation.source : relation.target;
    return (
      <div className="document-relation-row" key={relation.id}>
        <TypeIcon type={related.type} size={15} />
        <Link href={getItemHref(related)}>
          <span>{related.title}</span>
          {related.archivedAt && <small>Archiviato</small>}
        </Link>
        {direction === "outgoing" && relation.manual && (
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
        {direction === "outgoing" &&
          relation.relationType === "PARENT" &&
          !relation.isPrimary && (
            <button
              className="text-link relation-primary"
              disabled={busy}
              onClick={() => makePrimary(relation.id)}
            >
              Rendi principale
            </button>
          )}
        {
          <small className="document-relation-kind">
            {relation.wikilink
              ? "Nel testo"
              : relationLabels[relation.relationType]}
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
            {isCollection ? "Conoscenze collegate" : "Collegamenti"}
          </h2>
          <button
            className="text-link"
            aria-label="Aggiungi collegamento"
            onClick={() => openRelation("RELATED")}
          >
            <Plus size={14} />
            Collega
          </button>
        </div>
        {primaryContext && (
          <div className="document-contexts">
            <h3>Contenitore principale</h3>
            {relationRow(primaryContext, "outgoing")}
            {secondaryContexts.length > 0 && (
              <>
                <h3 className="document-secondary-contexts">Anche in</h3>
                {secondaryContexts.map((relation) =>
                  relationRow(relation, "outgoing"),
                )}
              </>
            )}
          </div>
        )}
        {isCollection && (
          <div className="document-organized">
            <h3>
              {item.type === "PROJECT"
                ? "Nel progetto"
                : item.type === "AREA"
                  ? "In quest’area"
                  : "In questa raccolta"}
              <span>{organized.length}</span>
            </h3>
            {organized.length ? (
              <div className="document-organized-groups">
                {itemTypes.map((type) => {
                  const group = organized.filter(
                    (relation) => relation.source.type === type,
                  );
                  return (
                    group.length > 0 && (
                      <section key={type}>
                        <h4>{typePluralLabels[type]}</h4>
                        {group.map((relation) =>
                          relationRow(relation, "incoming"),
                        )}
                      </section>
                    )
                  );
                })}
              </div>
            ) : (
              <p className="document-relation-empty">
                Gli elementi assegnati a{" "}
                {item.type === "PROJECT"
                  ? "questo progetto"
                  : item.type === "AREA"
                    ? "quest’area"
                    : "questa risorsa"}{" "}
                compariranno qui.
              </p>
            )}
          </div>
        )}
        <div className="document-relation-columns">
          <section>
            <h3>
              <ArrowUpRight size={13} />
              Collegamenti in uscita<span>{outgoing.length}</span>
            </h3>
            {outgoing.length ? (
              outgoing.map((relation) => relationRow(relation, "outgoing"))
            ) : (
              <p className="document-relation-empty">
                Collega una nota con <code>[[titolo]]</code> o usa Collega.
              </p>
            )}
          </section>
          <section>
            <h3>
              <ArrowDownLeft size={13} />
              Collegamenti in entrata<span>{incoming.length}</span>
            </h3>
            {incoming.length ? (
              incoming.map((relation) => relationRow(relation, "incoming"))
            ) : (
              <p className="document-relation-empty">
                Le note che rimandano qui compariranno in questo spazio.
              </p>
            )}
          </section>
        </div>
        <div className="document-connection-actions">
          {item.type !== "AREA" && (
            <button
              className="text-link"
              onClick={() => openRelation("PARENT")}
            >
              <Plus size={13} />
              Organizza in un contenitore
            </button>
          )}
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
        description="Trova una nota, un progetto o una risorsa da collegare."
      >
        <div className="relation-dialog-body">
          <label>
            Relazione
            <AppSelect
              aria-label="Relazione"
              value={relationType}
              onValueChange={(value) => {
                setRelationType(value as RelationType);
                setResults([]);
                setError("");
                setLoading(Boolean(query.trim()));
              }}
              options={[
                { value: "RELATED", label: "Collegato a" },
                { value: "REFERENCES", label: "Riferimenti" },
                {
                  value: "PARENT",
                  label: "Organizzato in un progetto, un’area o una risorsa",
                },
              ]}
            />
          </label>
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

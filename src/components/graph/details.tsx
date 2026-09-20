"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Network, X } from "lucide-react";
import type { ItemDetail } from "@/domain/types";
import { TypeBadge, TypeIcon } from "@/components/ui";
import { typeLabels, relationLabels } from "@/features/items/types";
import { api, errorMessage } from "@/features/items/api";

export function GraphDetails({
  id,
  onSelect,
  onFocus,
  onClose,
}: {
  id: string;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onClose: () => void;
}) {
  const [result, setResult] = useState<{
    id: string;
    item?: ItemDetail;
    error?: string;
  } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    api<{ item: ItemDetail }>(`/api/items/${id}`, { signal: controller.signal })
      .then((data) => setResult({ id, item: data.item }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ id, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [id, revision]);
  const item = result?.id === id ? result.item : undefined;
  return (
    <aside className="graph-details" aria-label="Elemento selezionato">
      <div className="graph-panel-heading">
        <span>Elemento selezionato</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Chiudi i dettagli dell’elemento"
          title="Chiudi (Esc)"
        >
          <X size={17} />
        </button>
      </div>
      {result?.id === id && result.error ? (
        <>
          <p role="alert">{result.error}</p>
          <button
            className="button button-secondary graph-open"
            onClick={() => setRevision((value) => value + 1)}
          >
            Riprova
          </button>
        </>
      ) : !item ? (
        <p role="status">Caricamento…</p>
      ) : (
        <>
          <TypeBadge type={item.type} />
          <h2>{item.title}</h2>
          {item.content && (
            <p className="graph-excerpt">
              {item.content.replace(/[#*`\[\]]/g, "").slice(0, 240)}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="graph-tags">
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
          <Link
            className="button button-primary graph-open"
            href={`/items/${item.id}`}
          >
            Apri {typeLabels[item.type].toLocaleLowerCase("it-IT")}
            <ArrowUpRight size={15} />
          </Link>
          <button
            className="button button-ghost graph-open"
            onClick={() => onFocus(item.id)}
          >
            <Network size={15} />
            Esplora da qui
          </button>
          <section className="graph-links">
            <h3>
              <ArrowUpRight size={14} />
              Collegamenti <span>{item.outgoing.length}</span>
            </h3>
            {item.outgoing.length ? (
              item.outgoing.map((edge) => (
                <button key={edge.id} onClick={() => onSelect(edge.target.id)}>
                  <TypeIcon type={edge.target.type} size={14} />
                  <span>
                    {edge.target.title}
                    <small>{relationLabels[edge.relationType]}</small>
                  </span>
                  <ArrowUpRight size={12} />
                </button>
              ))
            ) : (
              <p>Nessun collegamento in uscita.</p>
            )}
          </section>
          <section className="graph-links">
            <h3>
              <ArrowDownLeft size={14} />
              Backlink <span>{item.incoming.length}</span>
            </h3>
            {item.incoming.length ? (
              item.incoming.map((edge) => (
                <button key={edge.id} onClick={() => onSelect(edge.source.id)}>
                  <TypeIcon type={edge.source.type} size={14} />
                  <span>
                    {edge.source.title}
                    <small>{relationLabels[edge.relationType]}</small>
                  </span>
                  <ArrowUpRight size={12} />
                </button>
              ))
            ) : (
              <p>Nessun backlink.</p>
            )}
          </section>
          <div className="graph-dates">
            <span>
              Creato{" "}
              <b>
                {new Date(item.createdAt).toLocaleDateString("it-IT", {
                  timeZone: "Europe/Rome",
                })}
              </b>
            </span>
            <span>
              Modificato{" "}
              <b>
                {new Date(item.updatedAt).toLocaleDateString("it-IT", {
                  timeZone: "Europe/Rome",
                })}
              </b>
            </span>
            {item.archivedAt && (
              <span>
                Archiviato{" "}
                <b>
                  {new Date(item.archivedAt).toLocaleDateString("it-IT", {
                    timeZone: "Europe/Rome",
                  })}
                </b>
              </span>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

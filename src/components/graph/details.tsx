"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, GitBranch, Network, X } from "lucide-react";
import type { ItemDetail } from "@/domain/types";
import { TypeBadge, TypeIcon } from "@/components/ui";
import { typeLabels, relationLabels } from "@/features/items/types";
import { api, errorMessage } from "@/features/items/api";

export function GraphDetails({ id, onSelect, onFocus, onClose, mode = "3d" }: { id: string | null; onSelect: (id: string) => void; onFocus: (id: string) => void; onClose: () => void; mode?: "2d" | "3d" }) {
  const [result, setResult] = useState<{ id: string; item?: ItemDetail; error?: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    api<{ item: ItemDetail }>(`/api/items/${id}`, { signal: controller.signal }).then(data => setResult({ id, item: data.item })).catch(error => { if (!controller.signal.aborted) setResult({ id, error: errorMessage(error) }); });
    return () => controller.abort();
  }, [id]);
  if (!id) return <aside className="graph-details graph-details-empty"><span className="graph-detail-symbol"><Network size={30} /></span><h3>Segui un collegamento</h3><p>Seleziona un’idea per vedere i dettagli e scoprire i suoi collegamenti.</p><div className="graph-keyboard-hint">{mode === "3d" ? "Trascina per ruotare · Rotella per lo zoom" : "Trascina per spostare · Rotella per lo zoom"}<br />Seleziona un nodo per aprire i dettagli</div></aside>;
  const item = result?.id === id ? result.item : undefined;
  return <aside className="graph-details" aria-label="Elemento selezionato"><div className="graph-panel-heading"><span className="eyebrow">Elemento selezionato</span><button className="icon-button" onClick={onClose} aria-label="Chiudi i dettagli dell’elemento"><X size={17} /></button></div>
    {result?.id === id && result.error ? <p role="alert">{result.error}</p> : !item ? <p role="status">Caricamento dell’elemento…</p> : <>
      <TypeBadge type={item.type} /><h2>{item.title}</h2><p className="graph-excerpt">{item.content.replace(/[#*`\[\]]/g, "").slice(0, 240) || "Un’idea pronta a crescere."}</p>
      <div className="graph-tags">{item.tags.map(tag => <Link className="tag" href={`/tags?tag=${encodeURIComponent(tag.name)}`} key={tag.id}>#{tag.name}</Link>)}</div>
      <Link className="button button-primary graph-open" href={`/items/${item.id}`}>Apri {typeLabels[item.type].toLocaleLowerCase("it-IT")}<ArrowUpRight size={15} /></Link>
      <button className="button button-secondary graph-open" onClick={() => onFocus(item.id)}><Network size={15} />Esplora i collegamenti vicini</button>
      <div className="graph-dates"><span>Creato <b>{new Date(item.createdAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</b></span><span>Aggiornato <b>{new Date(item.updatedAt).toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</b></span></div>
      <section className="graph-links"><h3><GitBranch size={14} />In uscita <span>{item.outgoing.length}</span></h3>{item.outgoing.length ? item.outgoing.map(edge => <button key={edge.id} onClick={() => onSelect(edge.target.id)}><TypeIcon type={edge.target.type} size={14} /><span>{edge.target.title}<small>{relationLabels[edge.relationType]}</small></span><ArrowUpRight size={12} /></button>) : <p>Nessun collegamento in uscita.</p>}</section>
      <section className="graph-links"><h3><GitBranch size={14} />Collegamenti in entrata <span>{item.incoming.length}</span></h3>{item.incoming.length ? item.incoming.map(edge => <button key={edge.id} onClick={() => onSelect(edge.source.id)}><TypeIcon type={edge.source.type} size={14} /><span>{edge.source.title}<small>{relationLabels[edge.relationType]}</small></span><ArrowUpRight size={12} /></button>) : <p>Nessun collegamento in entrata.</p>}</section>
    </>}
  </aside>;
}

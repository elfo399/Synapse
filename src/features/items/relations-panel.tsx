"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Link2, LoaderCircle, Network, Plus, Search, Unlink } from "lucide-react";
import { Modal, TypeIcon } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import type { RelationType } from "@/domain/types";
import { api, changed, errorMessage } from "./api";
import { relationLabels } from "./types";
import type { ItemDetail, ItemSummary } from "./types";

export function RelationsPanel({ item, onReload }: { item: ItemDetail; onReload: () => void }) {
  const { notify } = useWorkspace();
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [relationType, setRelationType] = useState<RelationType>("RELATED"); const [results, setResults] = useState<ItemSummary[]>([]); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => { api<{ items: ItemSummary[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal }).then(result => setResults(result.items.filter(value => value.id !== item.id && (relationType !== "PARENT" || ["PROJECT", "AREA", "RESOURCE"].includes(value.type))))).catch(error => { if (!controller.signal.aborted) setError(errorMessage(error)); }); }, 150);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [open, query, item.id, relationType]);
  async function add(targetItemId: string) {
    setBusy(true); setError("");
    try { await api("/api/relations", { method: "POST", body: JSON.stringify({ sourceItemId: item.id, targetItemId, relationType }) }); onReload(); changed(); setOpen(false); notify("Nuovo collegamento creato."); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    try { await api("/api/relations", { method: "DELETE", body: JSON.stringify({ id }) }); onReload(); changed(); notify("Collegamento manuale rimosso."); } catch (error) { notify(errorMessage(error)); }
  }
  return <><section className="detail-section"><div className="detail-section-heading"><h2><Link2 size={16} />Collegamenti</h2><button className="icon-button" aria-label="Aggiungi collegamento" onClick={() => { setRelationType("RELATED"); setOpen(true); }}><Plus size={16} /></button></div><p className="section-hint">Le idee intorno a questa idea.</p><div className="relation-subheading"><ArrowUpRight size={13} />Collegamenti in uscita<span>{item.outgoing.length}</span></div>{item.outgoing.length ? item.outgoing.map(relation => <div className="relation-row" key={relation.id}><TypeIcon type={relation.target.type} size={14} /><Link href={`/items/${relation.target.id}`}>{relation.target.title}<span>{relation.relationType === "PARENT" ? "Organizzato in" : relation.wikilink ? "Collegamento interno" : relationLabels[relation.relationType]}</span></Link>{relation.manual && <button className="icon-button" aria-label={`Rimuovi il collegamento a ${relation.target.title}`} title={relation.wikilink ? "Rimuovi il collegamento manuale; quello interno rimane finché non lo rimuovi dal contenuto" : "Rimuovi collegamento"} onClick={() => remove(relation.id)}><Unlink size={13} /></button>}</div>) : <p className="relation-empty">Nessun collegamento in uscita.</p>}<button className="button button-secondary full-width" onClick={() => { setRelationType("PARENT"); setOpen(true); }}><Plus size={14} />Assegna a progetto, area o risorsa</button><div className="relation-subheading backlinks-heading"><ArrowDownLeft size={13} />Collegamenti in entrata<span>{item.incoming.length}</span></div>{item.incoming.length ? item.incoming.map(relation => <div className="relation-row" key={relation.id}><TypeIcon type={relation.source.type} size={14} /><Link href={`/items/${relation.source.id}`}>{relation.source.title}<span>{relation.relationType === "PARENT" ? "Organizzato qui" : relation.wikilink ? "Fa riferimento a questa idea" : "Collegato a questa idea"}</span></Link></div>) : <p className="relation-empty">Qui compariranno le idee che rimandano a questo elemento.</p>}<Link className="text-link local-graph-link" href={`/graph?focus=${item.id}`}><Network size={15} />Esplora i collegamenti vicini<ArrowUpRight size={14} /></Link></section>
    <Modal open={open} onOpenChange={setOpen} title="Crea un collegamento" description="Le idee diventano più utili quando sono collegate."><label>Relazione<select value={relationType} onChange={event => setRelationType(event.target.value as RelationType)}><option value="RELATED">Collegato a</option><option value="REFERENCES">Riferimenti</option><option value="PARENT">Organizzato in un progetto, un’area o una risorsa</option></select></label><div className="filter-search relation-search"><Search size={16} /><input aria-label="Trova un elemento da collegare" autoFocus placeholder="Cerca un elemento…" value={query} onChange={event => setQuery(event.target.value)} /></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="connection-results">{results.map(result => <button className="connection-result" key={result.id} disabled={busy} onClick={() => add(result.id)}><TypeIcon type={result.type} /><span>{result.title}</span>{busy ? <LoaderCircle size={14} className="spin" /> : <Plus size={15} />}</button>)}{!results.length && <p className="muted small">Nessun elemento trovato. Creane un altro, poi collegalo qui.</p>}</div></Modal>
  </>;
}

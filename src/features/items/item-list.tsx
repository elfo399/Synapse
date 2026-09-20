"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Circle, ListFilter, Plus, RotateCcw, Search } from "lucide-react";
import { EmptyState, ErrorState, ItemRow, Loading, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import { newItemLabels, pageLabels, itemTypes, statusLabels, statusesFor, typeLabels, type ItemListResponse, type ItemType, type Tag } from "./types";
import { useRemote } from "./use-remote";

const descriptions: Record<string, string> = {
  inbox: "Uno spazio per raccogliere i pensieri. Organizzali quando vuoi.",
  notes: "Un’idea alla volta. Una raccolta delle tue conoscenze che cresce.",
  tasks: "Trasforma le intenzioni in piccoli progressi.",
  projects: "Obiettivi concreti e tutto ciò che serve per raggiungerli.",
  areas: "Gli ambiti della tua vita di cui vuoi prenderti cura.",
  resources: "Conoscenze utili, pronte quando servono.",
  bookmarks: "I posti migliori del web, sempre a portata di mano.",
  archive: "Nulla è perso. Solo più spazio per ciò che verrà.",
};

export function ItemList({ kind, itemType, tag }: { kind: string; itemType?: ItemType; tag?: string }) {
  const { capture, notify } = useWorkspace();
  const [query, setQuery] = useState(""); const [debounced, setDebounced] = useState(""); const [status, setStatus] = useState(""); const [type, setType] = useState(""); const [tagFilter, setTagFilter] = useState(tag || ""); const [page, setPage] = useState(1); const [pending, setPending] = useState<string | null>(null);
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query), 200); return () => clearTimeout(timeout); }, [query]);
  const params = new URLSearchParams({ archive: kind === "archive" ? "archived" : "active", page: String(page), limit: "25" });
  if (itemType || type) params.set("type", itemType || type);
  if (kind === "inbox") params.set("inbox", "true");
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (tagFilter) params.set("tag", tagFilter);
  const { data, loading, error, reload } = useRemote<ItemListResponse>(`/api/items?${params}`);
  const { data: tags } = useRemote<{ tags: Tag[] }>("/api/tags");
  async function update(id: string, values: Record<string, unknown>, message: string) {
    setPending(id);
    try { await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify(values) }); changed(); notify(message); } catch (error) { notify(errorMessage(error)); } finally { setPending(null); }
  }
  const title = tag ? `#${tag}` : pageLabels[kind] || "Elementi";
  return <div className="page"><PageHeader eyebrow={kind === "inbox" ? "DAI PENSIERI ALLA CHIAREZZA" : kind === "archive" ? "SEMPRE PARTE DELLA TUA STORIA" : "LE TUE CONOSCENZE, IN ORDINE"} title={title} description={tag ? `Tutte le idee collegate dall’etichetta #${tag}.` : descriptions[kind] || "Esplora le tue conoscenze e i loro collegamenti."} actions={kind !== "archive" && <button className="button button-primary" onClick={() => capture(itemType || "NOTE", kind === "inbox")}><Plus size={16} />{kind === "inbox" ? "Annotazione rapida" : (itemType ? newItemLabels[itemType] : "Nuovo elemento")}</button>} />
    {kind === "inbox" && <div className="inbox-tip"><span className="inbox-tip-icon"><ListFilter size={20} /></span><div><strong>Un pensiero è un buon inizio. Un collegamento lo rende utile.</strong><p>Apri un elemento, scegli il tipo e dove organizzarlo, poi segna che è stato organizzato.</p></div></div>}
    <div className="list-toolbar"><div className="filter-search"><Search size={16} /><input aria-label="Filtra gli elementi" placeholder={`Cerca in ${title.toLocaleLowerCase("it-IT")}…`} value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><div className="list-filters">{!itemType && <select aria-label="Filtra per tipo" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">Tutti i tipi</option>{itemTypes.map(value => <option value={value} key={value}>{typeLabels[value]}</option>)}</select>}{itemType && ["TASK", "PROJECT"].includes(itemType) && <select aria-label="Filtra per stato" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">Tutti gli stati</option>{statusesFor(itemType).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select>}<select aria-label="Filtra per etichetta" value={tagFilter} onChange={event => { setTagFilter(event.target.value); setPage(1); }}><option value="">Tutte le etichette</option>{tags?.tags.map(value => <option key={value.id} value={value.name}>{value.name}</option>)}</select></div></div>
    <section className="panel list-panel"><div className="list-table-heading"><span>{data?.total ?? "…"} {data?.total === 1 ? "elemento" : "elementi"}</span><span>ULTIMA MODIFICA</span></div>{error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : !data?.items.length ? <EmptyState title={kind === "inbox" && !query ? "Tutto organizzato. La mente è più libera." : query || tagFilter || status ? "Nessun elemento corrisponde ai filtri." : "Spazio per qualcosa di nuovo."} description={kind === "inbox" ? "Annota un pensiero quando arriva. Lo ritroverai qui." : "La tua prossima idea potrebbe essere un buon inizio."} action={kind !== "archive" && <button className="button button-secondary" onClick={() => capture(itemType || "NOTE", kind === "inbox")}><Plus size={15} />{itemType ? newItemLabels[itemType] : "Crea il primo elemento"}</button>} /> : data.items.map(item => <ItemRow key={item.id} item={item} action={kind === "archive" ? <button className="icon-button" title="Ripristina elemento" aria-label={`Ripristina ${item.title}`} disabled={pending === item.id} onClick={() => update(item.id, { archived: false }, "Elemento ripristinato.")}><RotateCcw size={17} /></button> : item.type === "TASK" ? <button className={`task-check ${item.status === "DONE" ? "done" : ""}`} aria-label={`${item.status === "DONE" ? "Riapri" : "Completa"} ${item.title}`} disabled={pending === item.id} onClick={() => update(item.id, { status: item.status === "DONE" ? "TODO" : "DONE" }, item.status === "DONE" ? "Attività riaperta." : "Attività completata.")}>{item.status === "DONE" ? <Check size={17} /> : <Circle size={19} />}</button> : undefined} />)}
    {data && data.total > 25 && <div className="pagination"><span>Pagina {page} di {Math.ceil(data.total / 25)}</span><button className="button button-secondary compact" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ArrowLeft size={15} />Precedente</button><button className="button button-secondary compact" disabled={page * 25 >= data.total} onClick={() => setPage(value => value + 1)}>Successiva<ArrowRight size={15} /></button></div>}</section>
  </div>;
}

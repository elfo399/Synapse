"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, ArrowLeft, Check, CheckCheck, ExternalLink, LoaderCircle, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { ErrorState, Loading, Modal, TypeBadge } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import { typeRoutes, typePluralLabels, dateLabel, itemTypes, statusLabels, statusesFor, typeLabels, type ItemDetail as ItemDetailType, type ItemType } from "./types";
import { useRemote } from "./use-remote";
import { MarkdownEditor } from "./markdown-editor";
import { RelationsPanel } from "./relations-panel";

export function ItemDetail({ id }: { id: string }) {
  const { data, loading, error, reload } = useRemote<{ item: ItemDetailType }>(`/api/items/${id}`);
  if (error) return <div className="page"><ErrorState message={error} retry={reload} /></div>;
  if (loading || !data) return <Loading />;
  return <ItemEditor key={data.item.id} item={data.item} reload={reload} />;
}

function ItemEditor({ item, reload }: { item: ItemDetailType; reload: () => void }) {
  const router = useRouter(); const { notify } = useWorkspace();
  const [title, setTitle] = useState(item.title); const [content, setContent] = useState(item.content); const [type, setType] = useState(item.type); const [status, setStatus] = useState<string>(item.status); const [tags, setTags] = useState(item.tags.map(tag => tag.name).join(", ")); const [url, setUrl] = useState(item.url || ""); const [dueAt, setDueAt] = useState(item.dueAt?.slice(0, 10) || ""); const [version, setVersion] = useState(item.version);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [deleteOpen, setDeleteOpen] = useState(false); const [confirmation, setConfirmation] = useState(""); const [createTitle, setCreateTitle] = useState<string | null>(null);
  const dirty = title !== item.title || content !== item.content || type !== item.type || status !== item.status || tags !== item.tags.map(tag => tag.name).join(", ") || url !== (item.url || "") || dueAt !== (item.dueAt?.slice(0, 10) || "");
  useEffect(() => { const warn = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [dirty]);
  async function save(process = false) {
    setBusy(true); setError("");
    try {
      const result = await api<{ item: ItemDetailType }>(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ title, content, type, status, tags: tags.split(",").map(value => value.trim()).filter(Boolean), url: type === "BOOKMARK" ? url : null, dueAt: dueAt ? new Date(`${dueAt}T12:00:00`).toISOString() : null, version, ...(process ? { inbox: false } : {}) }) });
      setVersion(result.item.version); setTags(result.item.tags.map(tag => tag.name).join(", ")); changed(); reload(); notify(process ? "Elemento organizzato. Un po’ più di chiarezza." : "Modifiche salvate.");
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function archive() {
    setBusy(true); setError("");
    try { const result = await api<{ item: ItemDetailType }>(`/api/items/${item.id}`, { method: "PATCH", body: JSON.stringify({ archived: !item.archivedAt }) }); setVersion(result.item.version); changed(); reload(); notify(item.archivedAt ? "Elemento ripristinato." : "Elemento archiviato. Lo ritroverai quando ti servirà."); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await api(`/api/items/${item.id}`, { method: "DELETE", body: JSON.stringify({ confirmTitle: confirmation }) }); changed(); notify("Elemento eliminato definitivamente."); router.push("/archive"); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  async function createLinked() {
    if (!createTitle) return;
    setBusy(true); setError("");
    try { await api("/api/items", { method: "POST", body: JSON.stringify({ title: createTitle, type: "NOTE", inbox: true }) }); setCreateTitle(null); changed(); reload(); notify("Nota collegata creata tra gli elementi da organizzare. Salva il contenuto per collegarla."); } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <div className="page detail-page"><div className="detail-topline"><Link href={item.inbox ? "/inbox" : typeRoutes[item.type]} className="text-link"><ArrowLeft size={15} />{item.inbox ? "Torna agli elementi da organizzare" : `Vedi ${typePluralLabels[item.type].toLocaleLowerCase("it-IT")}`}</Link><div className="detail-actions"><span className={`save-indicator ${dirty ? "unsaved" : ""}`}>{dirty ? "Modifiche non salvate" : <><Check size={13} />Tutte le modifiche salvate</>}</span><button className="button button-primary" disabled={busy || !title.trim()} onClick={() => save()}>{busy ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}Salva modifiche</button></div></div>
    {item.inbox && <div className="processing-banner"><div><span className="eyebrow">DA ORGANIZZARE</span><strong>Un pensiero che aspetta di prendere forma.</strong><p>Scegli un tipo, aggiungi un’etichetta o trova un collegamento. Poi segnalo come organizzato.</p></div><button className="button button-primary" disabled={busy || !title.trim()} onClick={() => save(true)}><CheckCheck size={16} />Segna come organizzato</button></div>}
    {item.archivedAt && <div className="archive-banner"><Archive size={17} /><span>Questo elemento è archiviato. I suoi contenuti e collegamenti sono ancora disponibili.</span><button className="text-link" disabled={busy} onClick={archive}><RotateCcw size={14} />Ripristina</button></div>}
    {error && <p className="form-error error-banner" role="alert">{error}</p>}
    <div className="detail-grid"><article className="detail-main"><div className="item-title-area"><div className="item-title-meta"><TypeBadge type={type} /><span>Ultima modifica: {dateLabel(item.updatedAt)}</span></div><label className="sr-only" htmlFor="item-title">Titolo</label><input id="item-title" className="item-title-input" value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder="Dai un nome a questa idea" required /><div className="item-tag-list">{item.tags.map(tag => <Link className="tag" href={`/tags?tag=${encodeURIComponent(tag.name)}`} key={tag.id}>#{tag.name}</Link>)}</div></div>
      {item.url && <a className="bookmark-url" href={item.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15} /><span>{item.url}</span><ArrowLeft className="rotate-arrow" size={14} /></a>}
      <MarkdownEditor content={content} onChange={setContent} relations={item.outgoing} onCreate={setCreateTitle} />
      {item.unresolvedWikilinks.length > 0 && <section className="unresolved-links"><h3>Idee in attesa di uno spazio</h3><p>Questi collegamenti interni non hanno ancora un elemento. Crealo per completare il collegamento.</p><div>{item.unresolvedWikilinks.map(value => <button key={value} className="button button-secondary compact" onClick={() => setCreateTitle(value)}><Plus size={13} />{value}</button>)}</div></section>}
    </article><aside className="detail-sidebar"><section className="detail-section"><div className="detail-section-heading"><h2>Proprietà</h2><span className="subtle-label">PERSONALIZZA</span></div><label>Tipo di elemento<select value={type} onChange={event => { const next = event.target.value as ItemType; setType(next); setStatus(statusesFor(next)[0]); }}>{itemTypes.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}</select></label>{["TASK", "PROJECT"].includes(type) && <label>Stato<select value={status} onChange={event => setStatus(event.target.value)}>{statusesFor(type).map(value => <option key={value} value={value}>{statusLabels[value]}</option>)}</select></label>}<label>Etichette<input value={tags} onChange={event => setTags(event.target.value)} placeholder="idee, lavoro, letture" /><span className="field-hint">Separa le etichette con una virgola.</span></label>{type === "BOOKMARK" && <label>URL del preferito<input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://example.com" /></label>}{type === "TASK" && <label>Scadenza<input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>}<div className="property-date"><span>Creato</span><span>{dateLabel(item.createdAt)}</span></div></section><RelationsPanel item={item} onReload={reload} /><section className="detail-section danger-section"><button className="button button-secondary full-width" disabled={busy} onClick={archive}>{item.archivedAt ? <RotateCcw size={15} /> : <Archive size={15} />}{item.archivedAt ? "Ripristina elemento" : "Archivia elemento"}</button><button className="button button-ghost danger-text full-width" disabled={busy} onClick={() => { setConfirmation(""); setDeleteOpen(true); }}><Trash2 size={15} />Elimina definitivamente</button></section></aside></div>
    <Modal open={deleteOpen} onOpenChange={setDeleteOpen} title="Eliminare definitivamente questo elemento?" description="L’elemento e i suoi collegamenti saranno eliminati. L’operazione è irreversibile. Puoi archiviarlo se vuoi conservarlo."><label>Digita <strong>{item.title}</strong> per confermare<input autoComplete="off" value={confirmation} onChange={event => setConfirmation(event.target.value)} aria-label="Conferma il titolo dell’elemento" placeholder="Titolo esatto dell’elemento" /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button button-secondary" onClick={() => setDeleteOpen(false)}>Conserva elemento</button><button className="button button-danger" disabled={busy || confirmation !== item.title} onClick={remove}><Trash2 size={15} />Elimina definitivamente</button></div></Modal>
    <Modal open={createTitle !== null} onOpenChange={open => { if (!open) setCreateTitle(null); }} title="Dai uno spazio a questa idea" description="Crea una nota dal collegamento interno. La ritroverai tra gli elementi da organizzare."><p className="linked-create-title">{createTitle}</p>{error && <p className="form-error" role="alert">{error}</p>}<div className="dialog-footer"><button className="button button-secondary" onClick={() => setCreateTitle(null)}>Annulla</button><button className="button button-primary" disabled={busy} onClick={createLinked}><Plus size={15} />Crea nota collegata</button></div></Modal>
  </div>;
}

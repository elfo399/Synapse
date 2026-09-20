"use client";

import { useState } from "react";
import { ArrowUp, LoaderCircle, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import { newItemLabels, itemTypes, typeLabels, type ItemType } from "./types";

export function CaptureDialog({ open, onOpenChange, initialType, inbox }: { open: boolean; onOpenChange: (open: boolean) => void; initialType: ItemType; inbox: boolean }) {
  const { notify } = useWorkspace();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState(initialType);
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true); setError("");
    try {
      await api("/api/items", { method: "POST", body: JSON.stringify({ title: title.trim(), content, type, inbox, tags: tags.split(",").map(value => value.trim()).filter(Boolean), ...(type === "BOOKMARK" ? { url } : {}) }) });
      changed(); notify(inbox ? "Idea salvata tra gli elementi da organizzare." : "Elemento creato."); onOpenChange(false);
    } catch (error) { setError(errorMessage(error)); } finally { setBusy(false); }
  }
  return <Modal open={open} onOpenChange={onOpenChange} title={inbox ? "Uno spazio per la tua prossima idea" : newItemLabels[initialType]} description={inbox ? "Annota adesso. Organizza dopo." : "Dagli un nome. I collegamenti arriveranno dopo."}>
    <form onSubmit={submit} className="capture-form">
      <label className="sr-only" htmlFor="capture-title">Titolo</label><input id="capture-title" autoFocus placeholder="A che cosa stai pensando?" maxLength={200} required value={title} onChange={event => setTitle(event.target.value)} className="capture-title" />
      <label className="sr-only" htmlFor="capture-content">Contenuto</label><textarea id="capture-content" placeholder="Aggiungi un pensiero, un collegamento, qualche riga in Markdown…" value={content} onChange={event => setContent(event.target.value)} rows={5} />
      <div className="form-grid"><label>Tipo<select value={type} onChange={event => setType(event.target.value as ItemType)}>{itemTypes.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}</select></label><label>Etichette <span className="muted">facoltative</span><input placeholder="idee, letture" value={tags} onChange={event => setTags(event.target.value)} /></label></div>
      {type === "BOOKMARK" && <label>URL<input type="url" placeholder="https://example.com" value={url} onChange={event => setUrl(event.target.value)} required /></label>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="dialog-footer"><span className="small muted"><Sparkles size={14} />{inbox ? "Lo ritroverai tra gli elementi da organizzare" : "Un nuovo tassello di Synapse"}</span><button type="submit" className="button button-primary" disabled={busy || !title.trim()}>{busy ? <LoaderCircle size={16} className="spin" /> : <ArrowUp size={16} />}{inbox ? "Salva l’idea" : "Crea elemento"}</button></div>
    </form>
  </Modal>;
}

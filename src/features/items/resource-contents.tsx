"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Link2, Mic, Paperclip, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { Modal } from "@/components/ui";
import { attachmentHref, fileSizeLabel } from "@/domain/attachments";
import type { ItemDetail, ResourceBlockSummary, ResourceBlockType } from "@/domain/types";
import { MarkdownPreview } from "./markdown-editor";
import { api, changed, errorMessage } from "./api";
import { uploadItem } from "./upload";

type CreateMode = "TEXT" | "LINK" | null;

function FileBlock({ block }: { block: ResourceBlockSummary }) {
  const file = block.attachment;
  if (!file) return <p className="detail-empty">Questo allegato non è più disponibile.</p>;
  const href = attachmentHref(file.id);
  if (block.type === "IMAGE") return <a className="resource-block-image" href={href} target="_blank" rel="noreferrer"><img src={href} alt={file.originalName} /><span>{file.originalName}</span></a>;
  if (block.type === "AUDIO") return <div className="resource-block-audio"><Mic size={19} /><div><strong>{file.originalName}</strong><audio controls preload="metadata" src={href} /></div></div>;
  return <a className="resource-block-file" href={attachmentHref(file.id, true)}><FileText size={19} /><span><strong>{file.originalName}</strong><small>{fileSizeLabel(file.size)}</small></span></a>;
}

export function ResourceContents({ item, onReload }: { item: ItemDetail; onReload: () => void }) {
  const [mode, setMode] = useState<CreateMode>(null);
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const blocks = item.resourceBlocks;
  async function createBlock(type: ResourceBlockType, payload: Record<string, string> = {}) {
    setBusy(true); setError("");
    try { await api(`/api/items/${item.id}/blocks`, { method: "POST", body: JSON.stringify({ type, ...payload }) }); setMode(null); setValue(""); changed(); onReload(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function upload(input: FileList | null, type: "IMAGE" | "AUDIO" | "FILE") {
    if (!input?.length || busy) return;
    setBusy(true); setError("");
    try {
      const known = new Set(item.attachments?.map((file) => file.id));
      const result = await uploadItem(`/api/items/${item.id}/attachments`, {}, Array.from(input).map((file) => ({ key: crypto.randomUUID(), file, preview: "" })));
      const added = (result.item.attachments || []).filter((file) => !known.has(file.id));
      for (const file of added) await api(`/api/items/${item.id}/blocks`, { method: "POST", body: JSON.stringify({ type, attachmentId: file.id }) });
      changed(); onReload();
    } catch (failure) { setError(errorMessage(failure)); } finally {
      setBusy(false);
      [imageInput.current, audioInput.current, fileInput.current].forEach((element) => { if (element) element.value = ""; });
    }
  }
  async function reorder(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length || busy) return;
    const next = [...blocks]; [next[index], next[target]] = [next[target], next[index]];
    setBusy(true);
    try { await api(`/api/items/${item.id}/blocks`, { method: "PATCH", body: JSON.stringify({ blocks: next.map((block, position) => ({ id: block.id, position })) }) }); changed(); onReload(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    setBusy(true);
    try { await api(`/api/items/${item.id}/blocks`, { method: "DELETE", body: JSON.stringify({ id }) }); changed(); onReload(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  async function patch(id: string, patchData: { text?: string; url?: string }) {
    setBusy(true); setError("");
    try { await api(`/api/items/${item.id}/blocks`, { method: "PATCH", body: JSON.stringify({ blocks: [{ id, position: blocks.find((block) => block.id === id)?.position ?? 0, ...patchData }] }) }); changed(); onReload(); }
    catch (failure) { setError(errorMessage(failure)); } finally { setBusy(false); }
  }
  return <section className="resource-contents detail-card" id="contenuto" aria-labelledby="resource-contents-heading">
    <div className="detail-card-heading">
      <h2 id="resource-contents-heading"><Paperclip size={17} /> Contenuti <span>{blocks.length}</span></h2>
      <div className="resource-content-actions">
        <button className="text-link" onClick={() => { setValue(""); setMode("TEXT"); }}><Plus size={14} /> Scrivi testo</button>
        <button className="text-link" onClick={() => { setValue(""); setMode("LINK"); }}><Link2 size={14} /> Aggiungi link</button>
        <button className="text-link" disabled={busy} onClick={() => imageInput.current?.click()}><ImageIcon size={14} /> Immagine</button>
        <button className="text-link" disabled={busy} onClick={() => audioInput.current?.click()}><Mic size={14} /> Audio</button>
        <button className="text-link" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={14} /> Documento</button>
      </div>
      <input ref={imageInput} className="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void upload(event.target.files, "IMAGE")} />
      <input ref={audioInput} className="sr-only" type="file" multiple accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.m4a,.mp3,.wav,.ogg,.webm" onChange={(event) => void upload(event.target.files, "AUDIO")} />
      <input ref={fileInput} className="sr-only" type="file" multiple accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md" onChange={(event) => void upload(event.target.files, "FILE")} />
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {blocks.length ? <div className="resource-block-list">{blocks.map((block, index) => <article className="resource-block" key={block.id}>
      <div className="resource-block-tools"><button className="icon-button" disabled={busy || index === 0} aria-label="Sposta sopra" onClick={() => void reorder(index, -1)}><ArrowUp size={14} /></button><button className="icon-button" disabled={busy || index === blocks.length - 1} aria-label="Sposta sotto" onClick={() => void reorder(index, 1)}><ArrowDown size={14} /></button><button className="icon-button danger" disabled={busy} aria-label="Elimina blocco" onClick={() => void remove(block.id)}><Trash2 size={14} /></button></div>
      {block.type === "TEXT" ? editing === block.id ? <div className="resource-block-edit"><textarea value={value} onChange={(event) => setValue(event.target.value)} rows={8} autoFocus /><div><button className="button button-secondary compact" onClick={() => setEditing(null)}>Annulla</button><button className="button button-primary compact" disabled={busy} onClick={() => { void patch(block.id, { text: value }); setEditing(null); }}>Salva</button></div></div> : <div className="resource-block-text"><button className="text-link" onClick={() => { setEditing(block.id); setValue(block.text || ""); }}><Pencil size={13} /> Modifica</button><MarkdownPreview content={block.text || ""} relations={item.outgoing} onCreate={() => {}} /></div> : block.type === "LINK" ? <a className="resource-block-link" href={block.url || "#"} target="_blank" rel="noreferrer"><Link2 size={18} /><span><strong>{block.url}</strong><small>Apri il collegamento</small></span></a> : <FileBlock block={block} />}
    </article>)}</div> : <p className="detail-empty">Aggiungi testo, immagini, audio, documenti o link per creare la tua raccolta.</p>}
    <Modal open={mode !== null} onOpenChange={(open) => { if (!open && !busy) setMode(null); }} title={mode === "LINK" ? "Aggiungi un link" : "Aggiungi testo"} description={mode === "LINK" ? "Salva un collegamento nella raccolta." : "Scrivi un contenuto per questa risorsa."}>
      <div className="resource-create-block"><label>{mode === "LINK" ? "Indirizzo Web" : "Testo"}{mode === "LINK" ? <input type="url" value={value} placeholder="https://example.com" onChange={(event) => setValue(event.target.value)} autoFocus /> : <textarea value={value} rows={10} onChange={(event) => setValue(event.target.value)} autoFocus />}</label><div className="modal-actions"><button className="button button-secondary" onClick={() => setMode(null)}>Annulla</button><button className="button button-primary" disabled={busy || !value.trim()} onClick={() => void createBlock(mode!, mode === "LINK" ? { url: value.trim() } : { text: value })}>Aggiungi</button></div></div>
    </Modal>
  </section>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui";
import { api, errorMessage } from "./api";

type Block = { id: string; type: string; text: string | null; url: string | null; position: number };
type Snapshot = {
  title: string;
  content: string;
  type: string;
  tags: string[];
  status: string;
  inbox: boolean;
  dueAt: string | null;
  archivedAt: string | null;
  url: string | null;
  blocks: Block[];
};
type Revision = { id: string; revisionNumber: number; comment: string | null; restoredFromRevisionId: string | null; createdAt: string; snapshot: Snapshot };
type DiffEntry = { section: string; kind: "added" | "removed" | "changed"; value: string };

function readOnlyMarkdown(value: string) {
  return value.replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)|\[\[([^\]\n]+)\]\]/g, (match, code: string | undefined, reference: string | undefined) => {
    if (code || !reference) return match;
    const [title, alias] = reference.split("|");
    return alias?.trim() || title.trim();
  });
}

function lineDiff(before: string, after: string): DiffEntry[] {
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  let start = 0;
  while (start < oldLines.length && start < newLines.length && oldLines[start] === newLines[start]) start++;
  let oldEnd = oldLines.length;
  let newEnd = newLines.length;
  while (oldEnd > start && newEnd > start && oldLines[oldEnd - 1] === newLines[newEnd - 1]) { oldEnd--; newEnd--; }
  const oldPart = oldLines.slice(start, oldEnd);
  const newPart = newLines.slice(start, newEnd);
  if (!oldPart.length && !newPart.length) return [];
  // Line based LCS keeps moved or repeated lines distinguishable. Cap prevents huge snapshots using excessive memory.
  if (oldPart.length * newPart.length > 250_000)
    return [...oldPart.map((value) => ({ section: "Contenuto", kind: "removed" as const, value })), ...newPart.map((value) => ({ section: "Contenuto", kind: "added" as const, value }))];
  const width = newPart.length + 1;
  const matrix = Array.from({ length: oldPart.length + 1 }, () => new Uint16Array(width));
  for (let i = oldPart.length - 1; i >= 0; i--)
    for (let j = newPart.length - 1; j >= 0; j--)
      matrix[i][j] = oldPart[i] === newPart[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const result: DiffEntry[] = [];
  for (let i = 0, j = 0; i < oldPart.length || j < newPart.length;) {
    if (i < oldPart.length && j < newPart.length && oldPart[i] === newPart[j]) { i++; j++; }
    else if (j < newPart.length && (i === oldPart.length || matrix[i][j + 1] >= matrix[i + 1][j])) result.push({ section: "Contenuto", kind: "added", value: newPart[j++] || "(riga vuota)" });
    else result.push({ section: "Contenuto", kind: "removed", value: oldPart[i++] || "(riga vuota)" });
  }
  return result;
}

function value(value: string | boolean | null) {
  if (value === null || value === "") return "nessuno";
  if (typeof value === "boolean") return value ? "s?" : "no";
  return value;
}
function snapshotDiff(before: Snapshot, after: Snapshot) {
  const entries: DiffEntry[] = [];
  if (before.title !== after.title) entries.push({ section: "Titolo", kind: "changed", value: `${before.title} ? ${after.title}` });
  entries.push(...lineDiff(before.content, after.content));
  const metadata: Array<[string, string | boolean | null, string | boolean | null]> = [
    ["Tag", before.tags.join(", "), after.tags.join(", ")],
    ["Stato", before.status, after.status],
    ["Scadenza", before.dueAt, after.dueAt],
    ["URL", before.url, after.url],
    ["Tipo", before.type, after.type],
    ["Nell?Inbox", before.inbox, after.inbox],
    ["Archiviato", before.archivedAt, after.archivedAt],
  ];
  for (const [label, previous, current] of metadata)
    if (previous !== current) entries.push({ section: "Metadati", kind: "changed", value: `${label}: ${value(previous)} ? ${value(current)}` });
  const oldBlocks = new Map(before.blocks.map((block) => [block.id, block]));
  const newBlocks = new Map(after.blocks.map((block) => [block.id, block]));
  for (const block of before.blocks) {
    const current = newBlocks.get(block.id);
    const label = `Blocco ${block.position + 1} (${block.type})`;
    if (!current) entries.push({ section: "Blocchi della Risorsa", kind: "removed", value: `${label} rimosso` });
    else if (block.type !== current.type || block.position !== current.position || block.text !== current.text || block.url !== current.url)
      entries.push({ section: "Blocchi della Risorsa", kind: "changed", value: `${label}: ${value(block.text || block.url)} ? ${value(current.text || current.url)}` });
  }
  for (const block of after.blocks)
    if (!oldBlocks.has(block.id)) entries.push({ section: "Blocchi della Risorsa", kind: "added", value: `Blocco ${block.position + 1} (${block.type}) aggiunto: ${value(block.text || block.url)}` });
  return entries;
}

export function RevisionHistory({ itemId, version, open, onOpenChange, onRestored }: { itemId: string; version: number; open: boolean; onOpenChange: (open: boolean) => void; onRestored: () => void }) {
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [compare, setCompare] = useState<Revision | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [restore, setRestore] = useState(false);
  useEffect(() => {
    if (!open) return;
    setBusy(true); setError("");
    void api<{ revisions: Revision[] }>(`/api/items/${itemId}/revisions`).then((result) => {
      setRevisions(result.revisions); setSelected(result.revisions[0] ?? null); setCompare(result.revisions[1] ?? null);
    }).catch((reason) => setError(errorMessage(reason))).finally(() => setBusy(false));
  }, [open, itemId]);
  const changes = useMemo(() => selected && compare ? snapshotDiff(compare.snapshot, selected.snapshot) : [], [selected, compare]);
  async function restoreNow() {
    if (!selected) return;
    setBusy(true);
    try { await api(`/api/items/${itemId}/revisions`, { method: "POST", body: JSON.stringify({ revisionId: selected.id, version }) }); setRestore(false); onOpenChange(false); onRestored(); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  return <>
    <Modal open={open} onOpenChange={onOpenChange} title="Cronologia delle versioni" description="Le versioni appartengono a questo elemento e non modificano i collegamenti organizzativi." wide className="revision-dialog">
      <div className="revision-layout">
        <aside className="revision-list">{busy && <p>Caricamento?</p>}{revisions.map((revision, index) => <button type="button" key={revision.id} className={selected?.id === revision.id ? "selected" : ""} onClick={() => setSelected(revision)}><strong>Versione {revision.revisionNumber}{index === 0 ? " ? Attuale" : ""}</strong><small>{new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(revision.createdAt))}</small>{revision.comment && <em>{revision.comment}</em>}</button>)}</aside>
        <main className="revision-preview">{error && <p className="form-error">{error}</p>}{selected && <>
          <div className="revision-preview-heading"><div><span className="eyebrow">Versione {selected.revisionNumber}</span><h3>{selected.snapshot.title}</h3></div><button className="button button-secondary compact" disabled={busy} onClick={() => setRestore(true)}><RotateCcw size={15} /> Ripristina questa versione</button></div>
          <div className="revision-compare">{revisions.length > 1 ? <label>Confronta con<select value={compare?.id ?? ""} onChange={(event) => setCompare(revisions.find((revision) => revision.id === event.target.value) ?? null)}>{revisions.filter((revision) => revision.id !== selected.id).map((revision) => <option key={revision.id} value={revision.id}>Versione {revision.revisionNumber}</option>)}</select></label> : <span>Non esistono ancora altre versioni da confrontare.</span>}<span>Tag: {selected.snapshot.tags.join(", ") || "nessuno"} ? Stato: {selected.snapshot.status}</span></div>
          <article className="revision-content markdown-preview"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{readOnlyMarkdown(selected.snapshot.content) || "*Nessun contenuto testuale.*"}</ReactMarkdown>{selected.snapshot.blocks.length > 0 && <p className="revision-block-note">{selected.snapshot.blocks.length} blocchi della Risorsa salvati in questa versione.</p>}</article>
          {compare && <section className="revision-diff"><h4>Differenze con la versione {compare.revisionNumber}</h4>{changes.length ? changes.map((entry, index) => <p className={entry.kind} key={`${entry.section}-${entry.kind}-${index}`}><span>{entry.section}</span>{entry.kind === "added" ? "+" : entry.kind === "removed" ? "?" : "?"} {entry.value}</p>) : <p>Nessuna differenza: le due versioni hanno lo stesso contenuto, metadati e blocchi.</p>}</section>}
        </>}</main>
      </div>
    </Modal>
    <Modal open={restore} onOpenChange={setRestore} title="Ripristinare questa versione?" description="Verr? creata una nuova versione; quelle attuali resteranno disponibili."><div className="dialog-footer"><button className="button button-secondary" onClick={() => setRestore(false)}>Annulla</button><button className="button button-primary" disabled={busy} onClick={() => void restoreNow()}><RotateCcw size={15} /> Ripristina questa versione</button></div></Modal>
  </>;
}

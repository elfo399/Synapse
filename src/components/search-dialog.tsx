"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Search } from "lucide-react";
import { api, errorMessage } from "@/features/items/api";
import type { ItemSummary } from "@/features/items/types";
import { EmptyState, Modal, TypeBadge } from "./ui";

export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await api<{ items: ItemSummary[] }>(`/api/search?q=${encodeURIComponent(query)}&limit=15`, { signal: controller.signal });
        setItems(result.items); setSelected(0);
      } catch (error) { if (!controller.signal.aborted) setError(errorMessage(error)); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 180);
    return () => { clearTimeout(timeout); controller.abort(); };
  }, [query, open]);
  function navigate(item: ItemSummary) { onOpenChange(false); router.push(`/items/${item.id}`); }
  return <Modal open={open} onOpenChange={onOpenChange} title="Ritrova un’idea" description="Cerca tra titoli, note, etichette e idee archiviate." wide>
    <div className="command-input"><Search size={21} /><input ref={input} autoFocus aria-label="Cerca nelle tue conoscenze" role="combobox" aria-autocomplete="list" aria-controls="search-results" aria-expanded={items.length > 0} aria-activedescendant={items[selected] ? `search-${items[selected].id}` : undefined} placeholder="Che cosa stai cercando?" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => {
      if (event.key === "ArrowDown") { event.preventDefault(); setSelected(value => Math.min(value + 1, items.length - 1)); }
      if (event.key === "ArrowUp") { event.preventDefault(); setSelected(value => Math.max(value - 1, 0)); }
      if (event.key === "Enter" && items[selected]) { event.preventDefault(); navigate(items[selected]); }
    }} /></div>
    <div className="search-results" id="search-results" role="listbox" aria-label="Risultati di ricerca">
      {loading && <p className="search-message" role="status">Ricerca in Synapse…</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && items.length === 0 && <EmptyState title={query ? "Nessuna idea corrispondente" : "Le tue conoscenze, a portata di ricerca"} description={query ? "Prova un’altra parola o etichetta." : "Inizia a scrivere per trovare note, progetti, attività e altro."} />}
      {items.map((item, index) => <button key={item.id} id={`search-${item.id}`} role="option" aria-selected={selected === index} className={`search-result ${selected === index ? "selected" : ""}`} onMouseMove={() => setSelected(index)} onClick={() => navigate(item)}>
        <div><span className="search-result-title">{item.title}</span><p>{item.snippet || item.content?.slice(0, 130)}</p><div className="search-result-meta"><TypeBadge type={item.type} />{item.tags.map(tag => <span className="tag" key={tag.id}>{tag.name}</span>)}{item.archivedAt && <span className="subtle-label">Archiviato</span>}</div></div><ArrowUpRight size={16} />
      </button>)}
    </div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> per navigare</span><span><kbd>↵</kbd> per aprire</span><span><kbd>esc</kbd> per chiudere</span></div>
  </Modal>;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Hash, Search } from "lucide-react";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui";
import { useRemote } from "@/features/items/use-remote";
import type { Tag } from "@/features/items/types";

export function TagsPage() {
  const { data, error, loading, reload } = useRemote<{ tags: Tag[] }>("/api/tags");
  const [query, setQuery] = useState("");
  const tags = data?.tags.filter(tag => tag.name.toLowerCase().includes(query.toLowerCase())) || [];
  return <div className="page"><PageHeader eyebrow="IL FILO DELLE TUE IDEE" title="Etichette" description="Idee diverse, fili comuni. Segui un’etichetta e scopri i collegamenti." /><div className="list-toolbar"><div className="filter-search"><Search size={17} /><input aria-label="Cerca un’etichetta" placeholder="Cerca un’etichetta…" value={query} onChange={event => setQuery(event.target.value)} /></div><span className="muted small">Crea e assegna le etichette mentre modifichi un elemento.</span></div>{error ? <ErrorState message={error} retry={reload} /> : loading ? <Loading /> : tags.length ? <div className="tag-grid">{tags.map(tag => <Link key={tag.id} href={`/tags?tag=${encodeURIComponent(tag.name)}`} className="tag-card"><span className="tag-card-icon"><Hash size={22} /></span><div><h3>{tag.name}</h3><span>{tag.count || 0} {(tag.count || 0) === 1 ? "elemento collegato" : "elementi collegati"}</span></div><ArrowUpRight size={18} /></Link>)}</div> : <EmptyState title="Dai un filo comune alle tue idee." description={query ? "Nessuna etichetta corrisponde alla ricerca." : "Aggiungi un’etichetta a un elemento e comparirà qui."} />}</div>;
}

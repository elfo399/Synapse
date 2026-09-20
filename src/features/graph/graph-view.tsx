"use client";

import { useCallback, useEffect, useRef, useState, type RefAttributes } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Box, CircleDot, Maximize, Minus, Network, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import type { GraphData } from "@/domain/graph";
import type { ItemSummary, TagSummary } from "@/domain/types";
import { ITEM_TYPES } from "@/domain/types";
import { GraphCanvas } from "@/components/graph/canvas";
import { nodeColors, type GraphControls, type GraphCanvasProps } from "@/components/graph/shared";
import { GraphDetails } from "@/components/graph/details";
import { PageHeader, TypeIcon } from "@/components/ui";
import { typeLabels } from "@/features/items/types";
import { api, errorMessage } from "@/features/items/api";
import "./graph.css";
import "./graph-3d.css";

const GraphCanvas3D = dynamic<GraphCanvasProps & RefAttributes<GraphControls>>(
  () => import("@/components/graph/canvas-3d").then(module => module.GraphCanvas3D),
  { ssr: false, loading: () => <div className="graph-status" role="status">Apertura del grafo 3D…</div> },
);

export function GraphView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") || "";
  const controls = useRef<GraphControls>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [rendererNotice, setRendererNotice] = useState("");
  const [type, setType] = useState("");
  const [tag, setTag] = useState("");
  const [parent, setParent] = useState("");
  const [archive, setArchive] = useState("active");
  const [relation, setRelation] = useState("");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [limit, setLimit] = useState("500");
  const [selected, setSelected] = useState<string | null>(focus || null);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: GraphData; error?: string } | null>(null);
  const [options, setOptions] = useState<{ tags: TagSummary[]; parents: ItemSummary[] }>({ tags: [], parents: [] });
  useEffect(() => { const timeout = setTimeout(() => setDebounced(query), 250); return () => clearTimeout(timeout); }, [query]);
  const params = new URLSearchParams({ archive, limit });
  for (const [key, value] of Object.entries({ type, tag, parent, focus, relation, q: debounced })) if (value) params.set(key, value);
  const queryKey = params.toString();
  const key = `${queryKey}&revision=${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    api<GraphData>(`/api/graph?${queryKey}`, { signal: controller.signal }).then(data => setResult({ key, data })).catch(error => { if (!controller.signal.aborted) setResult({ key, error: errorMessage(error) }); });
    return () => controller.abort();
  }, [key, queryKey]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<{ tags: TagSummary[] }>("/api/tags", { signal: controller.signal }), api<{ items: ItemSummary[] }>("/api/items?type=PROJECT&limit=100", { signal: controller.signal }), api<{ items: ItemSummary[] }>("/api/items?type=AREA&limit=100", { signal: controller.signal })]).then(([tags, projects, areas]) => setOptions({ tags: tags.tags, parents: [...projects.items, ...areas.items] })).catch(() => { /* Main graph request reports connectivity errors. */ });
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("secondbrain:changed", refresh);
    return () => { controller.abort(); window.removeEventListener("secondbrain:changed", refresh); };
  }, []);
  const select = useCallback((id: string) => setSelected(id), []);
  const open = useCallback((id: string) => router.push(`/items/${id}`), [router]);
  const fallbackTo2D = useCallback(() => {
    setMode("2d");
    setRendererNotice("Il 3D non è disponibile in questo browser. Il grafo è aperto in 2D.");
  }, []);
  const local = (id: string) => { setSelected(id); router.push(`/graph?focus=${encodeURIComponent(id)}`); };
  const reset = () => { setType(""); setTag(""); setParent(""); setArchive("active"); setRelation(""); setQuery(""); setLimit("500"); setSelected(null); controls.current?.reset(); router.push("/graph"); };
  const data = result?.data;
  const loading = result?.key !== key;
  return <div className="page graph-page">
    <PageHeader eyebrow="IDEE IN COLLEGAMENTO" title={focus ? "Uno sguardo da vicino" : "Le tue conoscenze, collegate"} description={focus ? "Esplora questa idea e i suoi collegamenti diretti." : "Segui i collegamenti. Scopri una visione d’insieme."} actions={<>
      <div className="graph-view-mode" role="group" aria-label="Dimensioni del grafo">
        <button aria-pressed={mode === "2d"} onClick={() => { setMode("2d"); setRendererNotice(""); }}><CircleDot size={14} />2D</button>
        <button aria-pressed={mode === "3d"} onClick={() => { setMode("3d"); setRendererNotice(""); }}><Box size={14} />3D</button>
      </div>
      <button className="button button-secondary" onClick={reset}><RefreshCw size={15} />Ripristina vista</button>
    </>} />
    {rendererNotice && <p className="graph-renderer-notice" role="status">{rendererNotice}</p>}
    <div className="graph-toolbar"><label className="graph-search"><Search size={16} /><input aria-label="Cerca nel grafo" placeholder="Cerca un’idea nel grafo…" value={query} onChange={event => setQuery(event.target.value)} /></label><SlidersHorizontal className="muted" size={16} aria-hidden="true" />
      <select aria-label="Filtra per tipo di elemento" value={type} onChange={event => setType(event.target.value)}><option value="">Tutti i tipi</option>{ITEM_TYPES.map(value => <option key={value} value={value}>{typeLabels[value]}</option>)}</select>
      <select aria-label="Filtra per etichetta" value={tag} onChange={event => setTag(event.target.value)}><option value="">Tutte le etichette</option>{options.tags.map(value => <option key={value.id} value={value.name}>{value.name}</option>)}</select>
      <select aria-label="Filtra per progetto o area" value={parent} onChange={event => setParent(event.target.value)}><option value="">Progetti e aree</option>{options.parents.map(value => <option key={value.id} value={value.id}>{value.title}</option>)}</select>
      <select aria-label="Filtro archivio" value={archive} onChange={event => setArchive(event.target.value)}><option value="active">Elementi attivi</option><option value="all">Includi archivio</option><option value="archived">Solo archiviati</option></select>
      <select aria-label="Filtro relazioni" value={relation} onChange={event => setRelation(event.target.value)}><option value="">Tutte le relazioni</option><option value="RELATED">Collegati</option><option value="REFERENCES">Riferimenti</option><option value="PARENT">Organizzazione</option></select>
    </div>
    <div className="graph-workspace"><div className="graph-stage" tabIndex={0} role="group" aria-label="Grafo interattivo delle conoscenze" aria-describedby="graph-interaction-hint" onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      const directions: Record<string, ["horizontal" | "vertical", number]> = { ArrowLeft: ["horizontal", -.2], ArrowRight: ["horizontal", .2], ArrowUp: ["vertical", -.2], ArrowDown: ["vertical", .2] };
      if (mode === "3d" && directions[event.key]) { event.preventDefault(); controls.current?.rotate?.(...directions[event.key]); }
      if (event.key === "+" || event.key === "=") { event.preventDefault(); controls.current?.zoom(1.25); }
      if (event.key === "-") { event.preventDefault(); controls.current?.zoom(.8); }
      if (event.key === "0") { event.preventDefault(); controls.current?.fit(); }
    }}>
      <div className="graph-stage-label"><span className="graph-live-dot" />{focus ? "GRAFO LOCALE" : "GRAFO DELLE CONOSCENZE"}<b>{mode.toUpperCase()}</b><span>{data?.nodes.length ?? 0} nodi · {data?.edges.length ?? 0} collegamenti</span></div>
      {data && data.nodes.length > 0 && (mode === "3d"
        ? <GraphCanvas3D data={data} selected={selected} onSelect={select} onOpen={open} onUnavailable={fallbackTo2D} ref={controls} />
        : <GraphCanvas data={data} selected={selected} onSelect={select} onOpen={open} ref={controls} />)}
      {loading && <div className="graph-status" role="status">Collegamento delle tue idee…</div>}
      {!loading && result.error && <div className="graph-empty" role="alert"><p>{result.error}</p><button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Riprova</button></div>}
      {!loading && data?.nodes.length === 0 && <div className="graph-empty"><Network size={42} /><h2>Nessuna idea in questa vista</h2><p>Annota un pensiero, aggiungi un collegamento o modifica i filtri.</p><button className="button button-secondary" onClick={reset}>Azzera filtri</button></div>}
      <div className="graph-legend">{ITEM_TYPES.map(value => <span key={value} style={{ color: nodeColors[value] }}><TypeIcon type={value} size={12} />{typeLabels[value]}</span>)}</div>
      {mode === "3d" && <div className="graph-rotation-controls" role="group" aria-label="Ruota il grafo">
        <span>Ruota</span>
        <button aria-label="Ruota a sinistra" title="Ruota a sinistra" onClick={() => controls.current?.rotate?.("horizontal", -.25)}><ArrowLeft size={15} /></button>
        <button aria-label="Ruota a destra" title="Ruota a destra" onClick={() => controls.current?.rotate?.("horizontal", .25)}><ArrowRight size={15} /></button>
        <button aria-label="Inclina verso l’alto" title="Inclina verso l’alto" onClick={() => controls.current?.rotate?.("vertical", -.25)}><ArrowUp size={15} /></button>
        <button aria-label="Inclina verso il basso" title="Inclina verso il basso" onClick={() => controls.current?.rotate?.("vertical", .25)}><ArrowDown size={15} /></button>
      </div>}
      <div className="graph-controls"><button aria-label="Ingrandisci" title="Ingrandisci" onClick={() => controls.current?.zoom(1.25)}><Plus size={17} /></button><button aria-label="Riduci" title="Riduci" onClick={() => controls.current?.zoom(.8)}><Minus size={17} /></button><button aria-label="Adatta il grafo alla vista" title="Adatta alla vista" onClick={() => controls.current?.fit()}><Maximize size={16} /></button><button aria-label={mode === "3d" ? "Ripristina inquadratura" : "Ridisponi il grafo"} title={mode === "3d" ? "Ripristina inquadratura" : "Ridisponi il grafo"} onClick={() => controls.current?.reset()}><RefreshCw size={15} /></button></div>
    </div><GraphDetails id={selected} onSelect={select} onFocus={local} onClose={() => setSelected(null)} mode={mode} /></div>
    <p className="graph-interaction-hint" id="graph-interaction-hint">
      <span className="graph-pointer-hint">{mode === "3d" ? "Trascina per ruotare · Tasto destro per spostare · Rotella per lo zoom" : "Trascina per spostare · Rotella per lo zoom"}</span>
      <span className="graph-touch-hint">{mode === "3d" ? "Trascina per ruotare · Pizzica per lo zoom · Due dita per spostare" : "Trascina per spostare · Pizzica per lo zoom"}</span>
      <span className="graph-keyboard-shortcuts">{mode === "3d" ? "Frecce per ruotare · + / − per lo zoom · 0 per adattare la vista" : "+ / − per lo zoom · 0 per adattare la vista"}</span>
    </p>
    <footer className="graph-footer"><span>{data?.truncated ? `Visualizzati ${data.nodes.length} elementi su ${data.total}. Restringi i filtri o esplora i collegamenti vicini.` : "Ogni collegamento è un nuovo modo di ritrovare un’idea."}</span><label>Limite nodi <select aria-label="Limite dei nodi del grafo" value={limit} onChange={event => setLimit(event.target.value)}><option>250</option><option>500</option><option>1000</option><option>1500</option></select></label></footer>
    <details className="graph-node-browser"><summary>Esplora i nodi con la tastiera <span>{data?.nodes.length ?? 0}</span></summary><p className="muted">Primi 50 risultati. Usa ricerca e filtri per trovare altre idee.</p><div>{data?.nodes.slice(0, 50).map(node => <button key={node.id} aria-pressed={selected === node.id} onClick={() => select(node.id)}><TypeIcon type={node.type} size={14} />{node.title}</button>)}</div></details>
  </div>;
}

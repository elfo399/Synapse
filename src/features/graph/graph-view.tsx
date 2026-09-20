"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefAttributes,
} from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  CircleDot,
  Expand,
  List,
  Maximize,
  Minimize,
  Minus,
  Network,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { GraphData } from "@/domain/graph";
import type { ItemSummary, TagSummary } from "@/domain/types";
import { ITEM_TYPES } from "@/domain/types";
import { GraphCanvas } from "@/components/graph/canvas";
import {
  nodeColors,
  type GraphControls,
  type GraphCanvasProps,
} from "@/components/graph/shared";
import { GraphDetails } from "@/components/graph/details";
import { AppSelect } from "@/components/select";
import { TypeIcon } from "@/components/ui";
import { typeLabels } from "@/features/items/types";
import { api, errorMessage } from "@/features/items/api";
import "./graph.css";
import "./graph-3d.css";

const GraphCanvas3D = dynamic<GraphCanvasProps & RefAttributes<GraphControls>>(
  () =>
    import("@/components/graph/canvas-3d").then(
      (module) => module.GraphCanvas3D,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="graph-status" role="status">
        Apertura del grafo 3D…
      </div>
    ),
  },
);

export function GraphView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focus = searchParams.get("focus") || "";
  const depth = ["1", "2", "3"].includes(searchParams.get("depth") || "")
    ? searchParams.get("depth")!
    : "1";
  const controls = useRef<GraphControls>(null);
  const workspace = useRef<HTMLDivElement>(null);
  const filterPopover = useRef<HTMLDetailsElement>(null);
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [expanded, setExpanded] = useState(false);
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
  const [result, setResult] = useState<{
    key: string;
    data?: GraphData;
    error?: string;
  } | null>(null);
  const [options, setOptions] = useState<{
    tags: TagSummary[];
    parents: ItemSummary[];
  }>({ tags: [], parents: [] });
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(timeout);
  }, [query]);
  const params = new URLSearchParams({ archive, limit });
  for (const [key, value] of Object.entries({
    type,
    tag,
    parent,
    focus,
    relation,
    q: debounced,
    ...(focus ? { depth } : {}),
  }))
    if (value) params.set(key, value);
  const queryKey = params.toString();
  const key = `${queryKey}&revision=${revision}`;
  useEffect(() => {
    const controller = new AbortController();
    api<GraphData>(`/api/graph?${queryKey}`, { signal: controller.signal })
      .then((data) => setResult({ key, data }))
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ key, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [key, queryKey]);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      api<{ tags: TagSummary[] }>("/api/tags", { signal: controller.signal }),
      api<{ items: ItemSummary[] }>("/api/items?type=PROJECT&limit=100", {
        signal: controller.signal,
      }),
      api<{ items: ItemSummary[] }>("/api/items?type=AREA&limit=100", {
        signal: controller.signal,
      }),
    ])
      .then(([tags, projects, areas]) =>
        setOptions({
          tags: tags.tags,
          parents: [...projects.items, ...areas.items],
        }),
      )
      .catch(() => {
        /* The main request surfaces connectivity failures. */
      });
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("secondbrain:changed", refresh);
    return () => {
      controller.abort();
      window.removeEventListener("secondbrain:changed", refresh);
    };
  }, []);
  useEffect(() => {
    const fullscreenChanged = () =>
      setExpanded(Boolean(document.fullscreenElement));
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        !event.defaultPrevented &&
        !document.querySelector('[role="listbox"], [role="dialog"]')
      ) {
        if (filterPopover.current?.open) filterPopover.current.open = false;
        else if (expanded) setExpanded(false);
        else setSelected(null);
      }
    };
    document.addEventListener("fullscreenchange", fullscreenChanged);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", fullscreenChanged);
      document.removeEventListener("keydown", escape);
    };
  }, [expanded]);
  const select = useCallback((id: string) => setSelected(id), [setSelected]);
  const open = useCallback(
    (id: string) => router.push(`/items/${id}`),
    [router],
  );
  const fallbackTo2D = useCallback(() => {
    setMode("2d");
    setRendererNotice(
      "Il 3D non è disponibile in questo browser. Il grafo è aperto in 2D.",
    );
  }, [setMode, setRendererNotice]);
  const local = (id: string, nextDepth = depth) => {
    setSelected(id);
    router.push(`/graph?focus=${encodeURIComponent(id)}&depth=${nextDepth}`);
  };
  const global = () => {
    setSelected(null);
    router.push("/graph");
  };
  const reset = () => {
    setType("");
    setTag("");
    setParent("");
    setArchive("active");
    setRelation("");
    setQuery("");
    setLimit("500");
  };
  async function fullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    if (expanded) {
      setExpanded(false);
      return;
    }
    // Keep portaled selects inside the fullscreen element as well.
    try {
      if (document.documentElement.requestFullscreen)
        await document.documentElement.requestFullscreen();
      else setExpanded(true);
    } catch {
      setExpanded(true);
    }
  }
  const data = result?.data;
  const loading = result?.key !== key;
  const activeFilters = [
    type,
    tag,
    parent,
    relation,
    archive !== "active" ? archive : "",
  ].filter(Boolean).length;
  return (
    <div
      ref={workspace}
      className={`graph-page ${expanded ? "graph-expanded" : ""}`}
    >
      <h1 className="sr-only">Grafo delle conoscenze</h1>
      <div className="graph-toolbar">
        <label className="graph-search">
          <Search size={16} />
          <input
            aria-label="Cerca nel grafo"
            placeholder="Cerca nel grafo…"
            value={query}
            maxLength={200}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              className="icon-button"
              aria-label="Cancella ricerca"
              onClick={() => setQuery("")}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="graph-scope" role="group" aria-label="Ambito del grafo">
          <button aria-pressed={!focus} onClick={global}>
            Globale
          </button>
          <button
            aria-pressed={Boolean(focus)}
            disabled={!focus && !selected}
            title={
              !selected
                ? "Seleziona un nodo per esplorare il grafo locale"
                : "Esplora i collegamenti del nodo selezionato"
            }
            onClick={() => local(selected || focus)}
          >
            Locale
          </button>
        </div>
        {focus && (
          <div
            className="graph-depth"
            role="group"
            aria-label="Profondità del grafo locale"
          >
            <span>Livelli</span>
            {["1", "2", "3"].map((value) => (
              <button
                key={value}
                aria-pressed={depth === value}
                aria-label={`Profondità ${value}`}
                onClick={() => local(focus, value)}
              >
                {value}
              </button>
            ))}
          </div>
        )}
        <div
          className="graph-view-mode"
          role="group"
          aria-label="Dimensioni del grafo"
        >
          <button
            aria-pressed={mode === "2d"}
            onClick={() => {
              setMode("2d");
              setRendererNotice("");
            }}
          >
            <CircleDot size={14} />
            2D
          </button>
          <button
            aria-pressed={mode === "3d"}
            onClick={() => {
              setMode("3d");
              setRendererNotice("");
            }}
          >
            <Box size={14} />
            3D
          </button>
        </div>
        <details className="graph-filter-menu" ref={filterPopover}>
          <summary aria-label="Filtri del grafo">
            <SlidersHorizontal size={15} />
            <span>Filtri</span>
            {activeFilters > 0 && <b>{activeFilters}</b>}
          </summary>
          <div className="graph-filter-popover">
            <div className="graph-popover-heading">
              <strong>Filtri</strong>
              <button
                className="icon-button"
                aria-label="Chiudi filtri"
                onClick={() => {
                  if (filterPopover.current) filterPopover.current.open = false;
                }}
              >
                <X size={15} />
              </button>
            </div>
            <label>
              Tipo
              <AppSelect
                aria-label="Filtra per tipo di elemento"
                value={type}
                onValueChange={setType}
                options={[
                  { value: "", label: "Tutti i tipi" },
                  ...ITEM_TYPES.map((value) => ({
                    value,
                    label: typeLabels[value],
                  })),
                ]}
              />
            </label>
            <label>
              Etichetta
              <AppSelect
                aria-label="Filtra per etichetta"
                value={tag}
                onValueChange={setTag}
                options={[
                  { value: "", label: "Tutte le etichette" },
                  ...options.tags.map((value) => ({
                    value: value.name,
                    label: value.name,
                  })),
                ]}
              />
            </label>
            <label>
              Contesto
              <AppSelect
                aria-label="Filtra per progetto o area"
                value={parent}
                onValueChange={setParent}
                options={[
                  { value: "", label: "Progetti e aree" },
                  ...options.parents.map((value) => ({
                    value: value.id,
                    label: value.title,
                  })),
                ]}
              />
            </label>
            <label>
              Archivio
              <AppSelect
                aria-label="Filtro archivio"
                value={archive}
                onValueChange={setArchive}
                options={[
                  { value: "active", label: "Elementi attivi" },
                  { value: "all", label: "Includi archivio" },
                  { value: "archived", label: "Solo archiviati" },
                ]}
              />
            </label>
            <label>
              Relazione
              <AppSelect
                aria-label="Filtro relazioni"
                value={relation}
                onValueChange={setRelation}
                options={[
                  { value: "", label: "Tutte le relazioni" },
                  { value: "RELATED", label: "Collegati" },
                  { value: "REFERENCES", label: "Riferimenti" },
                  { value: "PARENT", label: "Organizzazione" },
                ]}
              />
            </label>
            <label>
              Limite nodi
              <AppSelect
                aria-label="Limite dei nodi del grafo"
                value={limit}
                onValueChange={setLimit}
                options={["250", "500", "1000", "1500"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </label>
            <button className="button button-ghost" onClick={reset}>
              <RefreshCw size={14} />
              Azzera filtri
            </button>
          </div>
        </details>
        <button
          className="icon-button graph-fullscreen"
          aria-label={expanded ? "Esci da schermo intero" : "Schermo intero"}
          title={expanded ? "Esci da schermo intero" : "Schermo intero"}
          onClick={fullscreen}
        >
          {expanded ? <Minimize size={17} /> : <Expand size={17} />}
        </button>
      </div>
      {rendererNotice && (
        <p className="graph-renderer-notice" role="status">
          {rendererNotice}
          <button
            className="icon-button"
            aria-label="Chiudi avviso"
            onClick={() => setRendererNotice("")}
          >
            <X size={14} />
          </button>
        </p>
      )}
      <div className={`graph-workspace ${selected ? "has-selection" : ""}`}>
        <div
          className="graph-stage"
          tabIndex={0}
          role="group"
          aria-label="Grafo interattivo delle conoscenze"
          aria-describedby="graph-interaction-hint"
          onPointerDown={() => {
            if (filterPopover.current) filterPopover.current.open = false;
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const directions: Record<
              string,
              ["horizontal" | "vertical", number]
            > = {
              ArrowLeft: ["horizontal", -0.2],
              ArrowRight: ["horizontal", 0.2],
              ArrowUp: ["vertical", -0.2],
              ArrowDown: ["vertical", 0.2],
            };
            if (mode === "3d" && directions[event.key]) {
              event.preventDefault();
              controls.current?.rotate?.(...directions[event.key]);
            }
            if (event.key === "+" || event.key === "=") {
              event.preventDefault();
              controls.current?.zoom(1.25);
            }
            if (event.key === "-") {
              event.preventDefault();
              controls.current?.zoom(0.8);
            }
            if (event.key === "0") {
              event.preventDefault();
              controls.current?.fit();
            }
          }}
        >
          <div className="graph-stage-label">
            <span>{focus ? "Locale" : "Tutte le conoscenze"}</span>
            {data && (
              <span>
                {data.nodes.length} nodi · {data.edges.length} collegamenti
              </span>
            )}
            {loading && data && <span role="status">Aggiornamento…</span>}
          </div>
          {data &&
            data.nodes.length > 0 &&
            (mode === "3d" ? (
              <GraphCanvas3D
                data={data}
                selected={selected}
                onSelect={select}
                onOpen={open}
                onUnavailable={fallbackTo2D}
                ref={controls}
              />
            ) : (
              <GraphCanvas
                data={data}
                selected={selected}
                onSelect={select}
                onOpen={open}
                ref={controls}
              />
            ))}
          {loading && !data && (
            <div className="graph-status" role="status">
              Caricamento del grafo…
            </div>
          )}
          {!loading && result?.error && (
            <div className="graph-empty" role="alert">
              <p>{result.error}</p>
              <button
                className="button button-secondary"
                onClick={() => setRevision((value) => value + 1)}
              >
                Riprova
              </button>
            </div>
          )}
          {!loading && data?.nodes.length === 0 && (
            <div className="graph-empty">
              <Network size={28} />
              <h2>Nessun elemento in questa vista.</h2>
              <p>Modifica i filtri o collega una nota con [[un’altra idea]].</p>
              <button className="button button-secondary" onClick={reset}>
                Azzera filtri
              </button>
            </div>
          )}
          <div className="graph-legend" aria-label="Tipi di nodo">
            {ITEM_TYPES.map((value) => (
              <span key={value}>
                <TypeIcon type={value} size={12} />
                <i style={{ background: nodeColors[value] }} />
                {typeLabels[value]}
              </span>
            ))}
          </div>
          <div className="graph-floating-controls">
            {mode === "3d" && (
              <div
                className="graph-rotation-controls"
                role="group"
                aria-label="Ruota il grafo"
              >
                <button
                  aria-label="Ruota a sinistra"
                  title="Ruota a sinistra"
                  onClick={() =>
                    controls.current?.rotate?.("horizontal", -0.25)
                  }
                >
                  <ArrowLeft size={14} />
                </button>
                <button
                  aria-label="Ruota a destra"
                  title="Ruota a destra"
                  onClick={() => controls.current?.rotate?.("horizontal", 0.25)}
                >
                  <ArrowRight size={14} />
                </button>
                <button
                  aria-label="Inclina verso l’alto"
                  title="Inclina verso l’alto"
                  onClick={() => controls.current?.rotate?.("vertical", -0.25)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label="Inclina verso il basso"
                  title="Inclina verso il basso"
                  onClick={() => controls.current?.rotate?.("vertical", 0.25)}
                >
                  <ArrowDown size={14} />
                </button>
              </div>
            )}
            <div className="graph-controls">
              <button
                aria-label="Ingrandisci"
                title="Ingrandisci"
                onClick={() => controls.current?.zoom(1.25)}
              >
                <Plus size={17} />
              </button>
              <button
                aria-label="Riduci"
                title="Riduci"
                onClick={() => controls.current?.zoom(0.8)}
              >
                <Minus size={17} />
              </button>
              <button
                aria-label="Adatta il grafo alla vista"
                title="Adatta alla vista (0)"
                onClick={() => controls.current?.fit()}
              >
                <Maximize size={16} />
              </button>
              <button
                aria-label={
                  mode === "3d"
                    ? "Ripristina inquadratura"
                    : "Ridisponi il grafo"
                }
                title="Ripristina vista"
                onClick={() => controls.current?.reset()}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </div>
        </div>
        {selected && (
          <GraphDetails
            id={selected}
            onSelect={select}
            onFocus={local}
            onClose={() => {
              setSelected(null);
              workspace.current
                ?.querySelector<HTMLElement>(".graph-stage")
                ?.focus();
            }}
          />
        )}
      </div>
      <footer className="graph-footer">
        <details className="graph-node-browser">
          <summary>
            <List size={13} />
            <span>Esplora i nodi con la tastiera</span>
            <b>{data?.nodes.length ?? 0}</b>
          </summary>
          <div className="graph-node-list">
            <p>Primi 50 nodi. Usa ricerca e filtri per trovare gli altri.</p>
            {data?.nodes.slice(0, 50).map((node) => (
              <button
                key={node.id}
                aria-pressed={selected === node.id}
                onClick={() => select(node.id)}
              >
                <TypeIcon type={node.type} size={14} />
                {node.title}
              </button>
            ))}
          </div>
        </details>
        <p className="graph-interaction-hint" id="graph-interaction-hint">
          <span className="graph-pointer-hint">
            {mode === "3d"
              ? "Trascina per ruotare · Rotella per lo zoom"
              : "Trascina per spostare · Rotella per lo zoom"}
          </span>
          <span className="graph-touch-hint">
            {mode === "3d"
              ? "Trascina per ruotare · Pizzica per lo zoom"
              : "Trascina per spostare · Pizzica per lo zoom"}
          </span>
          <span className="graph-keyboard-shortcuts">
            {mode === "3d"
              ? "Frecce: ruota · + / −: zoom · 0: adatta"
              : "+ / −: zoom · 0: adatta"}
          </span>
        </p>
        {data?.truncated && (
          <span className="graph-truncation">
            Vista limitata a {data.nodes.length} nodi. Restringi i filtri.
          </span>
        )}
      </footer>
    </div>
  );
}

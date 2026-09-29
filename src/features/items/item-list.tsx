"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Circle,
  Plus,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { AppSelect } from "@/components/select";
import {
  EmptyState,
  ErrorState,
  ItemRow,
  Loading,
  PageHeader,
} from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import {
  newItemLabels,
  pageLabels,
  itemTypes,
  statusLabels,
  statusesFor,
  typeLabels,
  type ItemListResponse,
  type ItemType,
  type Tag,
} from "./types";
import { useRemote } from "./use-remote";
import "./collections.css";

const descriptions: Record<string, string> = {
  inbox: "Pensieri raccolti, ancora da organizzare.",
  notes: "Idee, appunti e cose da ricordare.",
  tasks: "I tuoi prossimi passi.",
  projects: "Note, attività e risorse intorno a un obiettivo.",
  areas: "Gli ambiti di cui ti occupi nel tempo.",
  resources: "Riferimenti e conoscenze da ritrovare.",
  bookmarks: "Collegamenti che vuoi conservare.",
  archive: "Elementi conservati fuori dal tuo spazio attivo.",
};

export function ItemList({
  kind,
  itemType,
  tag,
}: {
  kind: string;
  itemType?: ItemType;
  tag?: string;
}) {
  const { capture, notify } = useWorkspace();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [tagFilter, setTagFilter] = useState(tag || "");
  const [page, setPage] = useState(1);
  const [pending, setPending] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), 200);
    return () => clearTimeout(timeout);
  }, [query]);
  const params = new URLSearchParams({
    archive: kind === "archive" ? "archived" : "active",
    page: String(page),
    limit: "25",
  });
  if (itemType || type) params.set("type", itemType || type);
  if (kind === "inbox") params.set("inbox", "true");
  if (debounced) params.set("q", debounced);
  if (status) params.set("status", status);
  if (tagFilter) params.set("tag", tagFilter);
  const { data, loading, error, reload } = useRemote<ItemListResponse>(
    `/api/items?${params}`,
  );
  const { data: tags } = useRemote<{ tags: Tag[] }>("/api/tags");
  async function update(
    id: string,
    values: Record<string, unknown>,
    message: string,
  ) {
    setPending(id);
    try {
      await api(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(values),
      });
      changed();
      notify(message);
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setPending(null);
    }
  }
  async function bulk(action: "complete" | "reopen" | "archive") {
    if (!selected.length) return;
    setPending("bulk");
    try {
      const result = await api<{ updated: number }>("/api/tasks/bulk", { method: "POST", body: JSON.stringify({ ids: selected, action }) });
      setSelected([]); changed(); await reload();
      notify(result.updated === 1 ? "Attività aggiornata." : `${result.updated} attività aggiornate.`);
    } catch (reason) { notify(errorMessage(reason)); }
    finally { setPending(null); }
  }
  const title = tag ? `#${tag}` : pageLabels[kind] || "Elementi";
  const hasFilters = Boolean(
    query || tagFilter !== (tag || "") || status || type,
  );
  function clearFilters() {
    setQuery("");
    setStatus("");
    setType("");
    setTagFilter(tag || "");
    setPage(1);
  }
  return (
    <div className={`page collection-page collection-${kind}`}>
      <PageHeader
        title={title}
        description={tag ? "Idee con questa etichetta." : descriptions[kind]}
        actions={
          kind !== "archive" && (
            <button
              className="button button-secondary"
              onClick={() => capture(itemType || "RESOURCE", kind === "inbox")}
            >
              <Plus size={16} />
              {kind === "inbox"
                ? "Annotazione rapida"
                : itemType
                  ? newItemLabels[itemType]
                  : "Nuovo elemento"}
            </button>
          )
        }
      />
      <div className="collection-toolbar">
        <div className="collection-search">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Filtra gli elementi"
            placeholder={`Cerca in ${title.toLocaleLowerCase("it-IT")}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="collection-filters">
          {!itemType && (
            <AppSelect
              aria-label="Filtra per tipo"
              value={type}
              onValueChange={(value) => {
                setType(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "Tutti i tipi" },
                ...itemTypes.map((value) => ({
                  value,
                  label: typeLabels[value],
                })),
              ]}
            />
          )}
          {itemType && ["TASK", "PROJECT"].includes(itemType) && (
            <AppSelect
              aria-label="Filtra per stato"
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
              options={[
                { value: "", label: "Tutti gli stati" },
                ...statusesFor(itemType).map((value) => ({
                  value,
                  label: statusLabels[value],
                })),
              ]}
            />
          )}
          <AppSelect
            aria-label="Filtra per etichetta"
            value={tagFilter}
            onValueChange={(value) => {
              setTagFilter(value);
              setPage(1);
            }}
            options={[
              { value: "", label: "Tutte le etichette" },
              ...(tags?.tags ?? []).map((value) => ({
                value: value.name,
                label: value.name,
              })),
            ]}
          />
        </div>
      </div>
      <section className="collection-list" aria-label={title}>
        <div className="collection-list-heading">
          <span>
            {data?.total ?? "…"} {data?.total === 1 ? "elemento" : "elementi"}
          </span>
          {hasFilters && (
            <button className="text-link" onClick={clearFilters}>
              <X size={12} />
              Azzera filtri
            </button>
          )}
          <span className="collection-updated">Ultima modifica</span>
        </div>
        {itemType === "TASK" && selected.length > 0 && (
          <div className="collection-bulk-actions" role="status">
            <span>{selected.length} selezionate</span>
            <button className="button button-secondary compact" disabled={pending === "bulk"} onClick={() => void bulk("complete")}>Completa</button>
            <button className="button button-secondary compact" disabled={pending === "bulk"} onClick={() => void bulk("reopen")}>Riapri</button>
            <button className="button button-ghost compact" disabled={pending === "bulk"} onClick={() => void bulk("archive")}>Archivia</button>
            <button className="text-link" onClick={() => setSelected([])}>Annulla</button>
          </div>
        )}
        {error ? (
          <ErrorState message={error} retry={reload} />
        ) : loading && !data ? (
          <Loading />
        ) : !data?.items.length ? (
          <EmptyState
            title={
              hasFilters
                ? "Nessun elemento corrisponde ai filtri."
                : kind === "inbox"
                  ? "Nessun pensiero da organizzare"
                  : kind === "archive"
                    ? "L’archivio è vuoto"
                    : "Ancora nessun elemento"
            }
            description={
              hasFilters
                ? "Prova un’altra ricerca o rimuovi un filtro."
                : kind === "inbox"
                  ? "Annota qualcosa quando vuoi."
                  : kind === "archive"
                    ? "Qui ritroverai gli elementi che archivi."
                    : "Inizia con una nota, un’idea o un riferimento."
            }
            action={
              kind !== "archive" && (
                <button
                  className="text-link"
                  onClick={() => capture(itemType || "RESOURCE", kind === "inbox")}
                >
                  <Plus size={15} />
                  {itemType
                    ? newItemLabels[itemType]
                    : "Crea il primo elemento"}
                </button>
              )
            }
          />
        ) : (
          data.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              action={
                kind === "archive" ? (
                  <button
                    className="icon-button"
                    title="Ripristina elemento"
                    aria-label={`Ripristina ${item.title}`}
                    disabled={pending === item.id}
                    onClick={() =>
                      update(
                        item.id,
                        { archived: false },
                        "Elemento ripristinato.",
                      )
                    }
                  >
                    <RotateCcw size={17} />
                  </button>
                ) : item.type === "TASK" ? (<>
                  <input
                    className="collection-select"
                    type="checkbox"
                    aria-label={`Seleziona ${item.title}`}
                    checked={selected.includes(item.id)}
                    onChange={(event) => setSelected((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                  />
                  <button
                    className={`collection-task-check ${item.status === "DONE" ? "done" : ""}`}
                    aria-label={`${item.status === "DONE" ? "Riapri" : "Completa"} ${item.title}`}
                    disabled={pending === item.id}
                    onClick={() =>
                      update(
                        item.id,
                        { status: item.status === "DONE" ? "TODO" : "DONE" },
                        item.status === "DONE"
                          ? "Attività riaperta."
                          : "Attività completata.",
                      )
                    }
                  >
                    {item.status === "DONE" ? (
                      <Check size={17} />
                    ) : (
                      <Circle size={19} />
                    )}
                  </button></>
                ) : undefined
              }
            />
          ))
        )}
        {data && data.total > 25 && (
          <div className="collection-pagination">
            <span>
              Pagina {page} di {Math.ceil(data.total / 25)}
            </span>
            <button
              className="button button-ghost compact"
              disabled={page === 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ArrowLeft size={15} />
              Precedente
            </button>
            <button
              className="button button-ghost compact"
              disabled={page * 25 >= data.total}
              onClick={() => setPage((value) => value + 1)}
            >
              Successiva
              <ArrowRight size={15} />
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

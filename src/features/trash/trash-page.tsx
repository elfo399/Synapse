"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, RotateCcw, Search, Trash2 } from "lucide-react";
import { Modal } from "@/components/ui";
import { api, errorMessage } from "@/features/items/api";

type TrashItem = {
  id: string;
  title: string;
  type: string;
  archivedAt: string | null;
  deletedAt: string | null;
};
type Operation = {
  id: string;
  rootItemId: string;
  includeContained: boolean;
  deletedAt: string;
  items: TrashItem[];
};
type Preview = {
  planId: string;
  root: TrashItem;
  items: TrashItem[];
  counts: Record<string, number>;
  attachments: number;
  relations: number;
  plannerBlocks: number;
};
type Summary = { operations: number; items: number; planId: string };

const typeLabels: Record<string, string> = {
  AREA: "Area",
  PROJECT: "Progetto",
  RESOURCE: "Risorsa",
  TASK: "Attivit?",
  BOOKMARK: "Preferito",
};

export function TrashPage() {
  const [operations, setOperations] = useState<Operation[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [purge, setPurge] = useState<Operation | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api<{ operations: Operation[]; summary: Summary }>(
        `/api/trash?q=${encodeURIComponent(query)}&type=${encodeURIComponent(type)}`,
      );
      setOperations(result.operations);
      setSummary(result.summary);
      setSelected((current) =>
        current.filter((id) =>
          result.operations.some((operation) => operation.id === id),
        ),
      );
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }, [query, type]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visible = useMemo(
    () =>
      [...operations].sort((a, b) =>
        order === "newest"
          ? new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime()
          : new Date(a.deletedAt).getTime() - new Date(b.deletedAt).getTime(),
      ),
    [operations, order],
  );

  async function restore(operation: Operation, itemId?: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/trash/${operation.id}/restore`, {
        method: "POST",
        body: JSON.stringify(itemId ? { itemId } : {}),
      });
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function restoreSelected() {
    setBusy(true);
    setError("");
    try {
      for (const id of selected) {
        await api(`/api/trash/${id}/restore`, { method: "POST", body: "{}" });
      }
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function openPurge(operation: Operation) {
    setPurge(operation);
    setPreview(null);
    setConfirmation("");
    setError("");
    try {
      setPreview(
        (await api<{ preview: Preview }>(`/api/trash/${operation.id}`)).preview,
      );
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function purgeNow() {
    if (!purge || !preview) return;
    setBusy(true);
    try {
      await api(`/api/trash/${purge.id}/purge`, {
        method: "POST",
        body: JSON.stringify({
          confirmTitle: confirmation,
          planId: preview.planId,
        }),
      });
      setPurge(null);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  async function emptyNow() {
    if (!summary) return;
    setBusy(true);
    try {
      await api("/api/trash/empty", {
        method: "POST",
        body: JSON.stringify({ confirm: confirmation, planId: summary.planId }),
      });
      setEmptyOpen(false);
      setConfirmation("");
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy(false);
    }
  }

  function toggleSelection(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    );
  }

  return (
    <div className="page trash-page">
      <header className="collection-header trash-header">
        <div>
          <p className="eyebrow">Recupero</p>
          <h1>Cestino</h1>
          <p>
            Gli elementi restano intatti finch? non scegli di eliminarli
            definitivamente.
          </p>
        </div>
        <button
          className="button button-danger"
          disabled={!summary?.items}
          onClick={() => {
            setConfirmation("");
            setEmptyOpen(true);
          }}
        >
          <Trash2 size={16} /> Svuota Cestino
        </button>
      </header>

      <div className="collection-toolbar trash-toolbar">
        <label className="search-field">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cerca nel Cestino"
          />
        </label>
        <label className="visually-hidden" htmlFor="trash-type">
          Filtra per tipologia
        </label>
        <select
          id="trash-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">Tutte le tipologie</option>
          {Object.entries(typeLabels).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <label className="visually-hidden" htmlFor="trash-order">
          Ordina per data
        </label>
        <select
          id="trash-order"
          value={order}
          onChange={(event) =>
            setOrder(event.target.value as "newest" | "oldest")
          }
        >
          <option value="newest">Pi? recenti</option>
          <option value="oldest">Meno recenti</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="trash-selection" aria-live="polite">
          <span>
            {selected.length}{" "}
            {selected.length === 1
              ? "gruppo selezionato"
              : "gruppi selezionati"}
          </span>
          <button
            className="button button-secondary compact"
            disabled={busy}
            onClick={() => void restoreSelected()}
          >
            <RotateCcw size={15} /> Ripristina selezionati
          </button>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <section className="trash-list" aria-label="Elementi nel Cestino">
        {visible.length ? (
          visible.map((operation) => {
            const root =
              operation.items.find(
                (item) => item.id === operation.rootItemId,
              ) ?? operation.items[0];
            return (
              <article className="trash-operation" key={operation.id}>
                <header>
                  <label className="trash-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(operation.id)}
                      onChange={() => toggleSelection(operation.id)}
                      aria-label={`Seleziona ${root?.title ?? "gruppo"}`}
                    />
                  </label>
                  <div className="trash-operation-title">
                    <h2>{root?.title ?? "Elemento rimosso"}</h2>
                    <p>
                      {operation.items.length}{" "}
                      {operation.items.length === 1 ? "elemento" : "elementi"} ?
                      eliminati il{" "}
                      {new Intl.DateTimeFormat("it-IT", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(operation.deletedAt))}
                    </p>
                  </div>
                  <div className="trash-operation-actions">
                    <button
                      className="button button-secondary compact"
                      disabled={busy}
                      onClick={() => void restore(operation)}
                    >
                      <RotateCcw size={15} /> Ripristina gruppo
                    </button>
                    <button
                      className="button button-danger compact"
                      disabled={busy}
                      onClick={() => void openPurge(operation)}
                    >
                      <Trash2 size={15} /> Elimina definitivamente
                    </button>
                  </div>
                </header>
                <button
                  className="text-link"
                  onClick={() =>
                    setExpanded(expanded === operation.id ? null : operation.id)
                  }
                  aria-expanded={expanded === operation.id}
                >
                  <ChevronDown size={15} />{" "}
                  {expanded === operation.id
                    ? "Nascondi dettagli"
                    : "Mostra dettagli"}
                </button>
                {expanded === operation.id && (
                  <ul>
                    {operation.items.map((item) => (
                      <li key={item.id}>
                        <span>
                          <strong>{item.title}</strong>
                          <small>
                            {typeLabels[item.type] ?? item.type}
                            {item.archivedAt ? " ? era archiviato" : ""}
                          </small>
                        </span>
                        <button
                          className="text-link"
                          disabled={busy}
                          onClick={() => void restore(operation, item.id)}
                        >
                          <RotateCcw size={14} /> Ripristina solo questo
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <Trash2 size={24} />
            <h2>Il Cestino ? vuoto</h2>
            <p>
              Gli elementi spostati qui potranno essere ripristinati quando
              vuoi.
            </p>
          </div>
        )}
      </section>

      <Modal
        open={Boolean(purge)}
        onOpenChange={(open) => !open && setPurge(null)}
        title="Eliminare definitivamente?"
        description="Questa operazione elimina file e metadati in modo irreversibile."
      >
        {preview ? (
          <>
            <p>
              {preview.items.length} elementi, {preview.attachments} allegati e{" "}
              {preview.relations} collegamenti saranno rimossi.{" "}
              {preview.plannerBlocks
                ? `${preview.plannerBlocks} blocchi Planner verranno scollegati.`
                : ""}
            </p>
            <p className="trash-counts">
              {Object.entries(preview.counts)
                .map(
                  ([itemType, count]) =>
                    `${count} ${typeLabels[itemType] ?? itemType}`,
                )
                .join(" ? ")}
            </p>
            <label>
              Digita <strong>{preview.root.title}</strong> per confermare
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
          </>
        ) : (
          <p>Caricamento anteprima?</p>
        )}
        <div className="dialog-footer">
          <button
            className="button button-secondary"
            onClick={() => setPurge(null)}
          >
            Annulla
          </button>
          <button
            className="button button-danger"
            disabled={busy || !preview || confirmation !== preview.root.title}
            onClick={() => void purgeNow()}
          >
            <Trash2 size={15} /> Elimina definitivamente
          </button>
        </div>
      </Modal>

      <Modal
        open={emptyOpen}
        onOpenChange={setEmptyOpen}
        title="Svuotare il Cestino?"
        description="Questa azione ? irreversibile e rimuove tutti gli elementi, gli allegati e i metadati nel Cestino."
      >
        <p>
          {summary?.items ?? 0} elementi in {summary?.operations ?? 0}{" "}
          {summary?.operations === 1 ? "gruppo" : "gruppi"} saranno eliminati
          definitivamente.
        </p>
        <label>
          Digita <strong>SVUOTA CESTINO</strong> per confermare
          <input
            autoComplete="off"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <div className="dialog-footer">
          <button
            className="button button-secondary"
            onClick={() => setEmptyOpen(false)}
          >
            Annulla
          </button>
          <button
            className="button button-danger"
            disabled={busy || confirmation !== "SVUOTA CESTINO"}
            onClick={() => void emptyNow()}
          >
            <Trash2 size={15} /> Svuota Cestino
          </button>
        </div>
      </Modal>
    </div>
  );
}

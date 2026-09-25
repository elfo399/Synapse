"use client";

import { useEffect, useState } from "react";

import { AlertTriangle, LoaderCircle, Trash2 } from "lucide-react";

import { Modal } from "@/components/ui";

import type { ItemDetail } from "@/domain/types";

import { api, errorMessage } from "./api";

type Preview = {
  planId: string;

  delete: { id: string; title: string; type: string; archived: boolean }[];

  retained: { id: string; title: string; type: string; reason: string }[];

  counts: Record<string, number>;

  archived: number;

  attachments: number;

  relations: number;

  plannerBlocks: number;
};

export function AdvancedDeletionDialog({
  item,
  open,
  onOpenChange,
  onDeleted,
}: {
  item: ItemDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [includeContained, setIncludeContained] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);

  const [confirmation, setConfirmation] = useState("");

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!open) return;

    let active = true;
    const timer = window.setTimeout(() => {
      if (!active) return;
      setPreview(null);
      setError("");
      setConfirmation("");
      api<{ preview: Preview }>(
        `/api/items/${item.id}/deletion-preview?includeContained=${includeContained}`,
      )
        .then((result) => {
          if (active) setPreview(result.preview);
        })
        .catch((reason) => {
          if (active) setError(errorMessage(reason));
        });
    }, 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, item.id, includeContained, reloadKey]);

  async function remove() {
    if (!preview) return;

    setBusy(true);
    setError("");

    try {
      await api(`/api/items/${item.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmTitle: item.title,
          includeContained,
          planId: preview.planId,
        }),
      });

      onOpenChange(false);
      onDeleted();
    } catch (reason) {
      setError(errorMessage(reason));
      setPreview(null);
      setReloadKey((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  const total = preview?.delete.length ?? 0;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Eliminare ${item.type === "AREA" ? "l’area" : "il progetto"}?`}
      description="Controlla l’anteprima prima di eliminare: gli elementi condivisi vengono sempre conservati."
    >
      <label className="advanced-delete-option">
        <input
          type="checkbox"
          checked={includeContained}
          onChange={(event) => setIncludeContained(event.target.checked)}
          disabled={busy}
        />{" "}
        <span>
          <strong>Sposta nel Cestino anche gli elementi contenuti</strong>
          <small>
            Gli elementi condivisi con altri contenitori resteranno al loro
            posto.
          </small>
        </span>
      </label>

      {!preview && !error && (
        <p className="advanced-delete-loading">
          <LoaderCircle size={16} className="spin" /> Calcolo dell’anteprima…
        </p>
      )}

      {preview && (
        <section className="advanced-delete-preview" aria-live="polite">
          <p>
            <AlertTriangle size={15} /> Verranno spostati nel Cestino{" "}
            <strong>{total}</strong> elementi, {preview.attachments} allegati e{" "}
            {preview.relations} collegamenti.{" "}
            {preview.plannerBlocks
              ? `${preview.plannerBlocks} blocchi Planner verranno scollegati.`
              : ""}
          </p>

          <ul>
            {preview.delete.map((entry) => (
              <li key={entry.id}>
                {entry.title} <span>{entry.type}</span>
              </li>
            ))}
          </ul>

          {preview.retained.length > 0 && (
            <details>
              <summary>Elementi conservati ({preview.retained.length})</summary>
              <ul>
                {preview.retained.map((entry) => (
                  <li key={entry.id}>
                    <strong>{entry.title}</strong>
                    <small>{entry.reason}</small>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      <label>
        Digita <strong>{item.title}</strong> per confermare
        <input
          autoComplete="off"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          placeholder="Titolo esatto"
        />
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="dialog-footer">
        <button
          className="button button-secondary"
          onClick={() => onOpenChange(false)}
        >
          Conserva elemento
        </button>
        <button
          className="button button-danger"
          disabled={busy || !preview || confirmation !== item.title}
          onClick={remove}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <Trash2 size={15} />
          )}{" "}
          Sposta nel Cestino
        </button>
      </div>
    </Modal>
  );
}

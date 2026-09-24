"use client";

import { useRef, useState } from "react";
import {
  BookOpen,
  Download,
  FileArchive,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { getItemHref } from "@/domain/item-url";
import type { ItemDetail } from "@/domain/types";
import { errorMessage } from "./api";

export function TransferActions({ item }: { item: ItemDetail }) {
  const { notify } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canContain = item.type === "AREA" || item.type === "PROJECT";
  const download = (format: "archive" | "readable") =>
    `/api/items/${encodeURIComponent(item.id)}/export${format === "readable" ? "?format=readable" : ""}`;
  async function importArchive() {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      if (canContain) form.set("targetId", item.id);
      const response = await fetch("/api/import", {
        method: "POST",
        body: form,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok)
        throw new Error(result?.error || "Importazione non riuscita.");
      setImportOpen(false);
      setFile(null);
      notify("Archivio importato. La raccolta è pronta.");
      window.location.assign(
        getItemHref({ id: result.itemId, title: result.title }),
      );
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="transfer-actions" aria-label="Importa o esporta">
        <button className="text-link" onClick={() => setExportOpen(true)}>
          <Download size={14} /> Esporta
        </button>
        <button className="text-link" onClick={() => setImportOpen(true)}>
          <Upload size={14} /> Importa
        </button>
      </div>
      <Modal
        open={exportOpen}
        onOpenChange={setExportOpen}
        title="Scegli il formato di esportazione"
        description="Scegli se conservare una copia da reimportare o una raccolta pronta da leggere."
        className="transfer-dialog"
      >
        <div className="export-format-list">
          <a
            className="export-format-option"
            href={download("archive")}
            onClick={() => setExportOpen(false)}
          >
            <span className="export-format-icon">
              <FileArchive size={22} />
            </span>
            <span>
              <strong>Archivio Synapse</strong>
              <small>
                Backup completo per trasferire o reimportare questo elemento su
                un’altra installazione.
              </small>
              <em>Reimportabile in Synapse</em>
            </span>
          </a>
          <a
            className="export-format-option"
            href={download("readable")}
            onClick={() => setExportOpen(false)}
          >
            <span className="export-format-icon readable">
              <BookOpen size={22} />
            </span>
            <span>
              <strong>Formato leggibile</strong>
              <small>
                Una raccolta HTML e Markdown da consultare o condividere anche
                senza Synapse. Estrai lo ZIP completo prima di aprire
                index.html.
              </small>
              <em>Solo consultazione</em>
            </span>
          </a>
        </div>
      </Modal>
      <Modal
        open={importOpen}
        onOpenChange={(next) => {
          if (!busy) setImportOpen(next);
        }}
        title="Importa da Synapse"
        description={
          canContain
            ? `La raccolta importata verrà organizzata in ${item.title}.`
            : "La raccolta verrà aggiunta al tuo spazio personale."
        }
        className="transfer-dialog"
      >
        <div className="transfer-dialog-content">
          <div className="transfer-dropzone">
            <FileArchive size={25} />
            <strong>{file ? file.name : "Scegli un archivio Synapse"}</strong>
            <span>Carica solo un Archivio Synapse ZIP, fino a 100 MB.</span>
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              Scegli archivio
            </button>
            <input
              ref={input}
              className="sr-only"
              type="file"
              accept="application/zip,.zip"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={busy}
              onClick={() => setImportOpen(false)}
            >
              Annulla
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!file || busy}
              onClick={() => void importArchive()}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Upload size={15} />
              )}{" "}
              Importa raccolta
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

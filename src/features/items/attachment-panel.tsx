"use client";

import { useState } from "react";
import {
  Download,
  FileText,
  LoaderCircle,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import { Modal } from "@/components/ui";
import {
  attachmentHref,
  fileSizeLabel,
  type AttachmentSummary,
} from "@/domain/attachments";
import { api, changed, errorMessage } from "./api";
import { DraftFiles, UploadPicker, uploadItem, useUploadDraft } from "./upload";

export function attachmentMarkdown(file: AttachmentSummary) {
  const name = file.originalName.replace(/[\[\]\\]/g, "");
  return `${file.mimeType.startsWith("image/") ? "!" : ""}[${name}](${attachmentHref(file.id)})`;
}

export function AttachmentPanel({
  itemId,
  attachments,
  onReload,
  onInsert,
}: {
  itemId: string;
  attachments: AttachmentSummary[];
  onReload: () => void;
  onInsert: (file: AttachmentSummary) => void;
}) {
  const draft = useUploadDraft();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<AttachmentSummary | null>(null);
  const [removing, setRemoving] = useState<AttachmentSummary | null>(null);
  async function upload() {
    setBusy(true);
    setError("");
    try {
      await uploadItem(`/api/items/${itemId}/attachments`, {}, draft.files);
      draft.clear();
      setOpen(false);
      changed();
      onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/attachments/${removing.id}`, {
        method: "DELETE",
        body: "{}",
      });
      setRemoving(null);
      changed();
      onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="detail-card"
      id="allegati"
      aria-labelledby="attachments-heading"
    >
      <div className="detail-card-heading">
        <h2 id="attachments-heading">
          <Paperclip size={17} />
          Allegati <span>{attachments.length}</span>
        </h2>
        <button
          className="text-link"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <Plus size={15} />
          Aggiungi file
        </button>
      </div>
      {!attachments.length && !open && (
        <p className="detail-empty">
          Conserva qui immagini, memo vocali e documenti legati a questa idea.
        </p>
      )}
      {open && (
        <div
          className="attachment-upload"
          onPaste={(event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              draft.add(Array.from(event.clipboardData.files));
            }
          }}
        >
          <UploadPicker
            maxBytes={draft.maxBytes}
            disabled={busy}
            onFiles={draft.add}
          />
          <DraftFiles
            files={draft.files}
            disabled={busy}
            onRemove={draft.remove}
          />
          <div className="attachment-actions">
            <button
              className="button button-primary"
              disabled={busy || !draft.files.length}
              onClick={upload}
            >
              {busy && <LoaderCircle size={14} className="spin" />}Carica
              allegati
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => {
                draft.clear();
                setOpen(false);
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}
      {(error || draft.error) && (
        <p className="form-error" role="alert">
          {error || draft.error}
        </p>
      )}
      <div className="attachment-grid">
        {attachments.map((file) => (
          <article className="attachment-entry" key={file.id}>
            <div className="attachment-preview">
              {file.mimeType.startsWith("image/") ? (
                <button
                  className="attachment-image-button"
                  onClick={() => setPreview(file)}
                  aria-label={`Apri ${file.originalName}`}
                >
                  {/* Private authenticated images must bypass the public image optimizer. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    loading="lazy"
                    src={attachmentHref(file.id)}
                    alt={file.originalName}
                  />
                </button>
              ) : file.mimeType.startsWith("audio/") ? (
                <audio
                  controls
                  preload="metadata"
                  src={attachmentHref(file.id)}
                  aria-label={file.originalName}
                />
              ) : (
                <FileText size={34} />
              )}
            </div>
            <strong className="attachment-name">{file.originalName}</strong>
            <small>
              {fileSizeLabel(file.size)} · {file.mimeType.split("/")[1]}
              {file.duration != null && ` · ${Math.round(file.duration)} s`}
            </small>
            <div className="attachment-actions">
              <a
                className="text-link"
                href={attachmentHref(file.id, true)}
                download
              >
                <Download size={13} />
                Scarica
              </a>
              {file.mimeType === "application/pdf" && (
                <a
                  className="text-link"
                  href={attachmentHref(file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apri PDF
                </a>
              )}
              <button className="text-link" onClick={() => onInsert(file)}>
                Inserisci nel testo
              </button>
              <button
                className="icon-button"
                aria-label={`Elimina ${file.originalName}`}
                onClick={() => {
                  setError("");
                  setRemoving(file);
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <Modal
        open={Boolean(preview)}
        onOpenChange={(value) => {
          if (!value) setPreview(null);
        }}
        title={preview?.originalName || "Anteprima"}
        description="Anteprima dell’immagine allegata."
      >
        {preview && (
          // Private authenticated content must bypass public image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="attachment-modal-preview"
            src={attachmentHref(preview.id)}
            alt={preview.originalName}
          />
        )}
      </Modal>
      <Modal
        open={Boolean(removing)}
        onOpenChange={(value) => {
          if (!value && !busy) setRemoving(null);
        }}
        title="Eliminare questo allegato?"
        description="Il file verrà eliminato definitivamente. Gli eventuali riferimenti nel testo smetteranno di funzionare."
      >
        <p className="attachment-name">{removing?.originalName}</p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-footer">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={() => setRemoving(null)}
          >
            Annulla
          </button>
          <button
            className="button button-danger"
            disabled={busy}
            onClick={remove}
          >
            Elimina allegato
          </button>
        </div>
      </Modal>
    </section>
  );
}

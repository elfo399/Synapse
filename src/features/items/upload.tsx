"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, FileUp, FileText, X } from "lucide-react";
import {
  ATTACHMENT_ACCEPT,
  fileSizeLabel,
  MAX_CAPTURE_FILES,
} from "@/domain/attachments";
import type { ItemDetail } from "@/domain/types";
import { api, errorMessage } from "./api";
import "./attachments.css";

export interface DraftFile {
  key: string;
  file: File;
  preview: string;
}
export function useUploadDraft() {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [maxBytes, setMaxBytes] = useState(25 * 1024 * 1024);
  const [error, setError] = useState("");
  const current = useRef<DraftFile[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    api<{ maxAttachmentBytes: number }>("/api/capture", {
      signal: controller.signal,
    })
      .then((data) => setMaxBytes(data.maxAttachmentBytes))
      .catch(() => {});
    return () => {
      controller.abort();
      current.current.forEach((file) => URL.revokeObjectURL(file.preview));
    };
  }, []);
  function add(input: File[]) {
    if (current.current.length + input.length > MAX_CAPTURE_FILES) {
      setError(`Puoi aggiungere al massimo ${MAX_CAPTURE_FILES} file.`);
      return false;
    }
    if (
      [...current.current.map((draft) => draft.file), ...input].reduce(
        (size, file) => size + file.size,
        0,
      ) > maxBytes
    ) {
      setError(
        `Il totale dei file non può superare ${fileSizeLabel(maxBytes)}.`,
      );
      return false;
    }
    if (
      input.some(
        (file) =>
          !file.size ||
          !/\.(jpe?g|png|webp|gif|m4a|mp3|wav|ogg|webm|pdf|txt|md|markdown)$/i.test(
            file.name,
          ),
      )
    ) {
      setError("Scegli immagini, audio, PDF o documenti di testo supportati.");
      return false;
    }
    setError("");
    current.current = [
      ...current.current,
      ...input.map((file) => ({
        key: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
      })),
    ];
    setFiles(current.current);
    return true;
  }
  function remove(key: string) {
    const found = current.current.find((file) => file.key === key);
    if (found) URL.revokeObjectURL(found.preview);
    current.current = current.current.filter((file) => file.key !== key);
    setFiles(current.current);
    setError("");
  }
  function clear() {
    current.current.forEach((file) => URL.revokeObjectURL(file.preview));
    current.current = [];
    setFiles([]);
    setError("");
  }
  return { files, maxBytes, error, add, remove, clear };
}

export async function uploadItem(
  endpoint: string,
  payload: unknown,
  files: DraftFile[],
): Promise<{ item: ItemDetail }> {
  if (!files.length && endpoint === "/api/capture")
    return api(endpoint, { method: "POST", body: JSON.stringify(payload) });
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  files.forEach((draft) => form.append("files", draft.file));
  const response = await fetch(endpoint, { method: "POST", body: form });
  const result = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(result?.error || "Caricamento non riuscito. Riprova.");
  return result;
}

export function DraftFiles({
  files,
  onRemove,
  disabled,
}: {
  files: DraftFile[];
  onRemove: (key: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="draft-files">
      {files.map((draft) => (
        <div className="draft-file" key={draft.key}>
          {draft.file.type.startsWith(
            "image/",
          ) /* Local, revocable previews never use Next's public image optimizer. */ ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={draft.preview} alt={`Anteprima di ${draft.file.name}`} />
          ) : (
            <FileText size={24} />
          )}
          <div>
            <strong>{draft.file.name}</strong>
            <small>{fileSizeLabel(draft.file.size)}</small>
            {draft.file.type.startsWith("audio/") && (
              <audio
                controls
                preload="metadata"
                src={draft.preview}
                aria-label={`Anteprima di ${draft.file.name}`}
              />
            )}
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={`Rimuovi ${draft.file.name}`}
            disabled={disabled}
            onClick={() => onRemove(draft.key)}
          >
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function UploadPicker({
  onFiles,
  maxBytes,
  mode = "file",
  disabled = false,
}: {
  onFiles: (files: File[]) => void;
  maxBytes: number;
  mode?: "image" | "audio" | "file";
  disabled?: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const accept =
    mode === "image"
      ? "image/jpeg,image/png,image/webp,image/gif"
      : mode === "audio"
        ? "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm,.m4a,.mp3,.wav,.ogg,.webm"
        : ATTACHMENT_ACCEPT;
  return (
    <div
      className={`upload-dropzone ${dragging ? "is-dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setDragging(false);
        if (!disabled) onFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <FileUp size={23} />
      <p>Trascina qui i file o sceglili dal dispositivo.</p>
      <div className="upload-picker-actions">
        <button
          className="button button-secondary"
          type="button"
          disabled={disabled}
          onClick={() => input.current?.click()}
        >
          Scegli{" "}
          {mode === "image" ? "immagini" : mode === "audio" ? "audio" : "file"}
        </button>
        {mode === "image" && (
          <button
            className="button button-ghost"
            type="button"
            disabled={disabled}
            onClick={() => camera.current?.click()}
          >
            <Camera size={16} />
            Scatta foto
          </button>
        )}
      </div>
      <small>
        Immagini, audio, PDF, TXT e Markdown · fino a {fileSizeLabel(maxBytes)}{" "}
        complessivi
      </small>
      <input
        ref={input}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label="Scegli allegati"
        multiple
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      <input
        ref={camera}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label="Scatta una foto"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        disabled={disabled}
        onChange={(event) => {
          onFiles(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function uploadError(error: unknown) {
  return errorMessage(error);
}

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  FileText,
  Image as ImageIcon,
  Link2,
  Mic,
  Paperclip,
  Plus,
  Upload,
} from "lucide-react";
import { Modal, TypeIcon } from "@/components/ui";
import { attachmentHref, fileSizeLabel } from "@/domain/attachments";
import { getItemHref } from "@/domain/item-url";
import type { ItemDetail, ItemType } from "@/domain/types";
import { MarkdownEditor, MarkdownPreview } from "./markdown-editor";
import { UniversalCaptureForm } from "./capture-dialog";
import { uploadItem } from "./upload";
import { changed, errorMessage } from "./api";

export function ResourceContents({
  item,
  content,
  editing,
  onEditingChange,
  onContentChange,
  onReload,
  onCreate,
  onUpload,
}: {
  item: ItemDetail;
  content: string;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onContentChange: (content: string) => void;
  onReload: () => void;
  onCreate: (title: string) => void;
  onUpload: (files: File[]) => Promise<string>;
}) {
  const [createType, setCreateType] = useState<ItemType | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const imageInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const documentInput = useRef<HTMLInputElement>(null);
  const children = item.incoming.filter(
    (relation) =>
      relation.relationType === "PARENT" &&
      ["NOTE", "BOOKMARK"].includes(relation.source.type),
  );
  const files = item.attachments || [];
  async function upload(filesToUpload: FileList | null) {
    if (!filesToUpload?.length) return;
    setUploading(true);
    setError("");
    try {
      await uploadItem(
        `/api/items/${item.id}/attachments`,
        {},
        Array.from(filesToUpload).map((file) => ({
          key: crypto.randomUUID(),
          file,
          preview: "",
        })),
      );
      changed();
      onReload();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setUploading(false);
      for (const input of [
        imageInput.current,
        audioInput.current,
        documentInput.current,
      ])
        if (input) input.value = "";
    }
  }
  return (
    <section
      className="resource-contents detail-card"
      id="contenuto"
      aria-labelledby="resource-contents-heading"
    >
      <div className="detail-card-heading">
        <h2 id="resource-contents-heading">
          <Paperclip size={17} />
          Contenuti{" "}
          <span>
            {children.length + files.length + (content.trim() ? 1 : 0)}
          </span>
        </h2>
        <div className="resource-content-actions">
          <button className="text-link" onClick={() => onEditingChange(true)}>
            <FileText size={14} />
            Scrivi testo
          </button>
          <button className="text-link" onClick={() => setCreateType("NOTE")}>
            <Plus size={14} />
            Nuova nota
          </button>
          <button
            className="text-link"
            onClick={() => setCreateType("BOOKMARK")}
          >
            <Link2 size={14} />
            Aggiungi link
          </button>
          <button
            className="text-link"
            disabled={uploading}
            onClick={() => imageInput.current?.click()}
          >
            <ImageIcon size={14} aria-hidden="true" />
            Immagine
          </button>
          <button
            className="text-link"
            disabled={uploading}
            onClick={() => audioInput.current?.click()}
          >
            <Mic size={14} />
            Audio
          </button>
          <button
            className="text-link"
            disabled={uploading}
            onClick={() => documentInput.current?.click()}
          >
            <Upload size={14} />
            Documento
          </button>
          <input
            ref={imageInput}
            className="sr-only"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={(event) => void upload(event.target.files)}
          />
          <input
            ref={audioInput}
            className="sr-only"
            type="file"
            multiple
            accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,audio/ogg,audio/webm,.m4a,.mp3,.wav,.ogg,.webm"
            onChange={(event) => void upload(event.target.files)}
          />
          <input
            ref={documentInput}
            className="sr-only"
            type="file"
            multiple
            accept="application/pdf,text/plain,text/markdown,.pdf,.txt,.md"
            onChange={(event) => void upload(event.target.files)}
          />
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {editing ? (
        <MarkdownEditor
          content={content}
          onChange={onContentChange}
          relations={item.outgoing}
          onCreate={onCreate}
          onUpload={onUpload}
        />
      ) : content.trim() ? (
        <div className="resource-text">
          <MarkdownPreview
            content={content}
            relations={item.outgoing}
            onCreate={onCreate}
          />
        </div>
      ) : null}
      <div className="resource-content-grid">
        {children.map((relation) => (
          <Link
            className="resource-content-entry"
            href={getItemHref(relation.source)}
            key={relation.id}
          >
            <TypeIcon type={relation.source.type} size={16} />
            <span>
              <strong>{relation.source.title}</strong>
              <small>
                {relation.source.type === "BOOKMARK"
                  ? relation.source.url
                  : relation.source.content
                      ?.replace(/\s+/g, " ")
                      .slice(0, 120) || "Apri la nota"}
              </small>
            </span>
          </Link>
        ))}
        {files.map((file) => (
          <a
            className="resource-content-entry"
            href={attachmentHref(file.id)}
            key={file.id}
            target={
              file.mimeType.startsWith("image/") ||
              file.mimeType === "application/pdf"
                ? "_blank"
                : undefined
            }
            rel="noreferrer"
          >
            <span className="resource-file-icon">
              {file.mimeType.startsWith("image/") ? (
                <ImageIcon size={17} aria-hidden="true" />
              ) : file.mimeType.startsWith("audio/") ? (
                <Mic size={17} />
              ) : (
                <FileText size={17} />
              )}
            </span>
            <span>
              <strong>{file.originalName}</strong>
              <small>
                {file.mimeType.startsWith("audio/")
                  ? "Memo audio"
                  : file.mimeType.startsWith("image/")
                    ? "Immagine"
                    : "Documento"}{" "}
                · {fileSizeLabel(file.size)}
              </small>
            </span>
          </a>
        ))}
      </div>
      {!content.trim() && !children.length && !files.length && (
        <p className="detail-empty">
          Aggiungi appunti, file e link: resteranno insieme senza duplicare le
          tue conoscenze.
        </p>
      )}
      <Modal
        open={Boolean(createType)}
        onOpenChange={(open) => {
          if (!open) setCreateType(null);
        }}
        title={createType === "BOOKMARK" ? "Aggiungi un link" : "Nuova nota"}
        description={`Il contenuto verrà aggiunto a ${item.title}.`}
        className="capture-dialog"
      >
        {createType && (
          <UniversalCaptureForm
            initialType={createType}
            inbox={false}
            parentIds={[item.id]}
            onSaved={() => {
              setCreateType(null);
              onReload();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

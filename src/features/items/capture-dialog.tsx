"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  LoaderCircle,
  SlidersHorizontal,
} from "lucide-react";
import { AppSelect } from "@/components/select";
import { Modal, TypeIcon } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "./api";
import { newItemLabels, itemTypes, typeLabels, type ItemType } from "./types";
import "./capture.css";

export function CaptureDialog({
  open,
  onOpenChange,
  initialType,
  inbox,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialType: ItemType;
  inbox: boolean;
}) {
  const { notify } = useWorkspace();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState(initialType);
  const [tags, setTags] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      await api("/api/items", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          content,
          type,
          inbox,
          tags: tags
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          ...(type === "BOOKMARK" ? { url } : {}),
        }),
      });
      changed();
      notify(
        inbox
          ? "Idea salvata tra gli elementi da organizzare."
          : "Elemento creato.",
      );
      onOpenChange(false);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={inbox ? "Annotazione rapida" : newItemLabels[type]}
      description={
        inbox
          ? "Salva un pensiero. Puoi organizzarlo più tardi."
          : "Scrivi un titolo e aggiungi ciò che vuoi conservare."
      }
      initialFocusRef={titleInput}
      className="capture-dialog"
    >
      <form
        onSubmit={submit}
        className="capture-form"
        onKeyDown={(event) => {
          if (
            (event.ctrlKey || event.metaKey) &&
            event.key === "Enter" &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            event.currentTarget.requestSubmit();
          }
        }}
      >
        <label className="sr-only" htmlFor="capture-title">
          Titolo
        </label>
        <input
          ref={titleInput}
          id="capture-title"
          placeholder="Cosa vuoi ricordare?"
          maxLength={200}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="capture-title"
        />
        <label className="sr-only" htmlFor="capture-content">
          Contenuto
        </label>
        <textarea
          id="capture-content"
          placeholder="Continua a scrivere…"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
        />
        <div className="capture-writing-hint">
          <span>Markdown · [[collegamenti]]</span>
          <span>Contenuto facoltativo</span>
        </div>
        {type === "BOOKMARK" && (
          <label className="capture-url">
            URL
            <input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
            />
          </label>
        )}
        {detailsOpen && (
          <div className="capture-metadata" id="capture-details">
            <label>
              Tipo
              <AppSelect
                aria-label="Tipo"
                value={type}
                onValueChange={(nextValue) => setType(nextValue as ItemType)}
                options={itemTypes.map((value) => ({
                  value,
                  label: typeLabels[value],
                }))}
              />
            </label>
            <label>
              Etichette
              <input
                placeholder="idee, letture"
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                aria-describedby="capture-tags-hint"
              />
            </label>
            <p id="capture-tags-hint">Separa le etichette con una virgola.</p>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="capture-controls">
          <button
            type="button"
            className="capture-details-button"
            onClick={() => setDetailsOpen((value) => !value)}
            aria-expanded={detailsOpen}
            aria-controls="capture-details"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            Dettagli
            <ChevronDown size={12} aria-hidden="true" />
          </button>
          <span className="capture-current-type">
            <TypeIcon type={type} size={13} />
            {typeLabels[type]}
          </span>
          <button
            type="submit"
            className="button button-primary"
            disabled={busy || !title.trim()}
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <ArrowUp size={15} aria-hidden="true" />
            )}
            {inbox ? "Salva l’idea" : "Crea elemento"}
          </button>
        </div>
        <div className="capture-bottom-line">
          <span>
            {inbox
              ? "Destinazione: Da organizzare"
              : "Nel tuo spazio personale"}
          </span>
          <span>
            <kbd>Ctrl / ⌘</kbd> <kbd>↵</kbd> per salvare
          </span>
        </div>
      </form>
    </Modal>
  );
}

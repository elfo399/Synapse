"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  LoaderCircle,
  Mic,
  Paperclip,
  SlidersHorizontal,
} from "lucide-react";
import { AppSelect } from "@/components/select";
import { Modal } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { captureUrl } from "@/domain/attachments";
import { changed, errorMessage } from "./api";
import { DraftFiles, UploadPicker, uploadItem, useUploadDraft } from "./upload";
import { AudioRecorder } from "./audio-recorder";
import { newItemLabels, itemTypes, typeLabels, type ItemType } from "./types";
import "./capture.css";

type Mode = "text" | "link" | "image" | "audio" | "file";
const modes = [
  { value: "text", label: "Testo", icon: FileText },
  { value: "link", label: "Link", icon: LinkIcon },
  { value: "image", label: "Immagine", icon: ImageIcon },
  { value: "audio", label: "Audio", icon: Mic },
  { value: "file", label: "File", icon: Paperclip },
] as const;

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
  const focus = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={(value) => {
        if (!busy) onOpenChange(value);
      }}
      title={inbox ? "Cattura universale" : newItemLabels[initialType]}
      description="Un pensiero, un link, una foto o un memo. Organizza quando vuoi."
      initialFocusRef={focus}
      className="capture-dialog"
    >
      <UniversalCaptureForm
        initialType={initialType}
        inbox={inbox}
        titleRef={focus}
        onBusyChange={setBusy}
        onSaved={() => onOpenChange(false)}
      />
    </Modal>
  );
}

export function UniversalCaptureForm({
  initialType = "NOTE",
  inbox = true,
  embedded = false,
  titleRef,
  onBusyChange,
  onSaved,
  parentIds,
}: {
  parentIds?: string[];
  initialType?: ItemType;
  inbox?: boolean;
  embedded?: boolean;
  titleRef?: React.RefObject<HTMLInputElement | null>;
  onBusyChange?: (busy: boolean) => void;
  onSaved?: () => void;
}) {
  const { notify } = useWorkspace();
  const [mode, setMode] = useState<Mode>(
    initialType === "BOOKMARK" ? "link" : "text",
  );
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState(initialType);
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [memo, setMemo] = useState<{ name: string; duration: number } | null>(
    null,
  );
  const draft = useUploadDraft();
  const canSave = Boolean(
    title.trim() || content.trim() || url.trim() || draft.files.length,
  );
  function chooseMode(next: Mode) {
    setMode(next);
    if (next === "link") setType("BOOKMARK");
    else if (type === "BOOKMARK")
      setType(next === "file" ? "RESOURCE" : "NOTE");
    else if (next === "file" && type === "NOTE") setType("RESOURCE");
  }
  function addFiles(files: File[]) {
    if (!files.length || busy || recording) return;
    if (draft.add(files) && mode === "text")
      chooseMode(
        files[0].type.startsWith("image/")
          ? "image"
          : files[0].type.startsWith("audio/")
            ? "audio"
            : "file",
      );
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave || busy || recording) return;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      const voice = Boolean(
        memo && draft.files.some((file) => file.file.name === memo.name),
      );
      await uploadItem(
        "/api/capture",
        {
          title: title.trim(),
          content,
          type,
          inbox,
          parentIds,
          tags: tags
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          ...(type === "BOOKMARK" ? { url } : {}),
          voice,
          ...(voice && draft.files.length === 1
            ? { duration: memo!.duration }
            : {}),
        },
        draft.files,
      );
      changed();
      notify(
        inbox
          ? "Cattura salvata tra gli elementi da organizzare."
          : "Elemento creato.",
      );
      draft.clear();
      setTitle("");
      setContent("");
      setUrl("");
      setTags("");
      setMemo(null);
      setMode("text");
      setType(initialType);
      onSaved?.();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }
  return (
    <form
      onSubmit={submit}
      className={`capture-form universal-capture ${embedded ? "capture-embedded" : ""}`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        addFiles(Array.from(event.dataTransfer.files));
      }}
      onPaste={(event) => {
        const files = Array.from(event.clipboardData.files);
        if (files.length) {
          event.preventDefault();
          addFiles(files);
          return;
        }
        const pasted = captureUrl(event.clipboardData.getData("text/plain"));
        if (
          pasted &&
          !busy &&
          (event.target as HTMLElement).getAttribute("type") !== "url"
        ) {
          event.preventDefault();
          chooseMode("link");
          setUrl(pasted);
        }
      }}
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
      {(!embedded || detailsOpen) && (
        <label className="capture-title-label">
          <span className="sr-only">Titolo</span>
          <input
            ref={titleRef}
            placeholder="Titolo (facoltativo)"
            maxLength={200}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            className="capture-title"
          />
        </label>
      )}
      {type === "BOOKMARK" && (
        <label className="capture-url">
          URL
          <input
            type="url"
            placeholder="https://example.com"
            required
            value={url}
            disabled={busy}
            onChange={(event) => setUrl(event.target.value)}
          />
        </label>
      )}
      <label className="capture-content-label">
        <span className="sr-only">Contenuto</span>
        <textarea
          placeholder={
            mode === "text"
              ? "Cosa vuoi ricordare?"
              : "Aggiungi un appunto (facoltativo)…"
          }
          value={content}
          onChange={(event) => setContent(event.target.value)}
          disabled={busy}
          rows={embedded ? 3 : 4}
        />
      </label>
      <div className="capture-modes" role="group" aria-label="Tipo di cattura">
        {modes.map((entry, index) => (
          <button
            key={entry.value}
            type="button"
            aria-pressed={mode === entry.value}
            disabled={busy || recording}
            onClick={() => chooseMode(entry.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                event.preventDefault();
                const next =
                  (index +
                    (event.key === "ArrowRight" ? 1 : -1) +
                    modes.length) %
                  modes.length;
                const buttons =
                  event.currentTarget.parentElement?.querySelectorAll("button");
                (buttons?.[next] as HTMLButtonElement)?.focus();
                chooseMode(modes[next].value);
              }
            }}
          >
            <entry.icon size={15} />
            {entry.label}
          </button>
        ))}
      </div>
      {mode === "audio" && (
        <AudioRecorder
          maxBytes={draft.maxBytes}
          onRecordingChange={setRecording}
          onRecorded={(file, duration) => {
            if (memo)
              draft.files
                .filter((entry) => entry.file.name === memo.name)
                .forEach((entry) => draft.remove(entry.key));
            if (draft.add([file])) setMemo({ name: file.name, duration });
          }}
        />
      )}
      {["image", "audio", "file"].includes(mode) && (
        <UploadPicker
          mode={mode as "image" | "audio" | "file"}
          maxBytes={draft.maxBytes}
          onFiles={addFiles}
          disabled={busy || recording}
        />
      )}
      <DraftFiles
        files={draft.files}
        onRemove={draft.remove}
        disabled={busy || recording}
      />
      {detailsOpen && (
        <div className="capture-metadata">
          <label>
            Tipo
            <AppSelect
              aria-label="Tipo"
              value={type}
              onValueChange={(value) => setType(value as ItemType)}
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
            />
          </label>
          <p>Separa le etichette con una virgola.</p>
        </div>
      )}
      {(error || draft.error) && (
        <p className="form-error" role="alert">
          {error || draft.error}
        </p>
      )}
      <div className="capture-controls">
        <button
          type="button"
          className="capture-details-button"
          onClick={() => setDetailsOpen((value) => !value)}
          aria-expanded={detailsOpen}
        >
          <SlidersHorizontal size={14} />
          Dettagli
        </button>
        <span className="capture-current-type">
          {inbox ? "Da organizzare" : typeLabels[type]}
        </span>
        <button
          type="submit"
          className="button button-primary"
          disabled={busy || recording || !canSave}
        >
          {busy ? (
            <LoaderCircle size={15} className="spin" />
          ) : (
            <ArrowUp size={15} />
          )}
          {inbox ? "Salva l’idea" : "Crea elemento"}
        </button>
      </div>
      <div className="capture-bottom-line">
        <span>Il titolo viene ricavato dal contenuto se lo lasci vuoto.</span>
        <span>
          <kbd>Ctrl / ⌘ ↵</kbd>
        </span>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  Eye,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Undo2,
} from "lucide-react";

type FloatingItemActionsProps = {
  dirty: boolean;
  busy: boolean;
  editing: boolean;
  archived: boolean;
  onSave: () => void;
  onToggleEditing: () => void;
  onOrganize: () => void;
  onDiscard: () => void;
  onArchive: () => void;
  onTrash: () => void;
};

export function FloatingItemActions({
  dirty,
  busy,
  editing,
  archived,
  onSave,
  onToggleEditing,
  onOrganize,
  onDiscard,
  onArchive,
  onTrash,
}: FloatingItemActionsProps) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function choose(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div
      className={`floating-item-actions ${dirty ? "is-dirty" : ""}`}
      aria-live="polite"
    >
      <span className="floating-save-status" role="status">
        {busy ? (
          <><LoaderCircle size={15} className="spin" /> Salvataggio…</>
        ) : dirty ? (
          <>Modifiche non salvate</>
        ) : (
          <><Check size={15} /> Tutto salvato</>
        )}
      </span>
      {dirty && (
        <button
          type="button"
          className="button button-primary floating-save-button"
          disabled={busy}
          onClick={onSave}
        >
          <Save size={15} /> Salva
        </button>
      )}
      <div className="floating-action-menu" ref={menu}>
        <button
          type="button"
          className="icon-button"
          aria-label="Altre azioni"
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
          onClick={() => setOpen((value) => !value)}
        >
          <MoreHorizontal size={19} />
        </button>
        {open && (
          <div className="floating-action-popover" role="menu" aria-label="Azioni dell’elemento">
            <button type="button" role="menuitem" onClick={() => choose(onToggleEditing)}>
              {editing ? <Eye size={15} /> : <Pencil size={15} />}
              {editing ? "Anteprima" : "Modifica"}
            </button>
            <button type="button" role="menuitem" onClick={() => choose(onOrganize)}>
              <SlidersHorizontal size={15} /> Organizza
            </button>
            {dirty && (
              <button type="button" role="menuitem" onClick={() => choose(onDiscard)}>
                <Undo2 size={15} /> Scarta modifiche
              </button>
            )}
            <button type="button" role="menuitem" onClick={() => choose(onArchive)}>
              {archived ? <RotateCcw size={15} /> : <Archive size={15} />}
              {archived ? "Ripristina dall’Archivio" : "Archivia"}
            </button>
            <button
              type="button"
              role="menuitem"
              className="floating-danger-action"
              onClick={() => choose(onTrash)}
            >
              <Trash2 size={15} /> Sposta nel Cestino
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

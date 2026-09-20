"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowUpRight,
  CornerDownLeft,
  FilePlus2,
  Hash,
  Inbox,
  LoaderCircle,
  Network,
  Plus,
  Search,
  type LucideIcon,
} from "lucide-react";
import { api, errorMessage } from "@/features/items/api";
import {
  typeLabels,
  type ItemSummary,
  type ItemType,
  type Tag,
} from "@/features/items/types";
import { Modal, TypeIcon } from "./ui";
import { useWorkspace } from "./workspace-context";
import "./search-dialog.css";

type CommandAction = {
  id: string;
  title: string;
  description: string;
  keywords: string;
  icon: LucideIcon;
  href?: string;
  type?: ItemType;
  inbox?: boolean;
};
type PaletteEntry =
  | { kind: "item"; item: ItemSummary; id: string }
  | { kind: "tag"; tag: Tag; id: string }
  | { kind: "action"; action: CommandAction; id: string };

const actions: CommandAction[] = [
  {
    id: "capture",
    title: "Annotazione rapida",
    description: "Salva un pensiero da organizzare",
    keywords: "nuova idea cattura appunto",
    icon: Plus,
    type: "NOTE",
    inbox: true,
  },
  {
    id: "note",
    title: "Nuova nota",
    description: "Apri uno spazio per scrivere",
    keywords: "crea note testo markdown",
    icon: FilePlus2,
    type: "NOTE",
  },
  {
    id: "graph",
    title: "Esplora il grafo",
    description: "Segui i collegamenti tra le tue idee",
    keywords: "connessioni rete mappa",
    icon: Network,
    href: "/graph",
  },
  {
    id: "inbox",
    title: "Apri Da organizzare",
    description: "Riprendi i pensieri da sistemare",
    keywords: "inbox raccolta",
    icon: Inbox,
    href: "/inbox",
  },
  {
    id: "task",
    title: "Nuova attività",
    description: "Annota qualcosa da fare",
    keywords: "crea compito promemoria task",
    icon: Plus,
    type: "TASK",
  },
  {
    id: "project",
    title: "Nuovo progetto",
    description: "Raccogli conoscenze intorno a un obiettivo",
    keywords: "crea progetti",
    icon: Plus,
    type: "PROJECT",
  },
  {
    id: "bookmark",
    title: "Nuovo preferito",
    description: "Conserva un collegamento",
    keywords: "crea link url segnalibro",
    icon: Plus,
    type: "BOOKMARK",
  },
  {
    id: "tags",
    title: "Esplora le etichette",
    description: "Ritrova idee con un tema comune",
    keywords: "tag",
    icon: Hash,
    href: "/tags",
  },
  {
    id: "archive",
    title: "Apri l’archivio",
    description: "Ritrova le conoscenze archiviate",
    keywords: "archiviate",
    icon: Archive,
    href: "/archive",
  },
];

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { capture } = useWorkspace();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tagError, setTagError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const results = useRef<HTMLDivElement>(null);
  const trimmedQuery = query.trim();
  const tagsOnly = trimmedQuery.startsWith("#");
  const actionsOnly = trimmedQuery.startsWith(">");
  const filter = trimmedQuery
    .replace(/^[#>]\s*/, "")
    .toLocaleLowerCase("it-IT");

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    api<{ tags: Tag[] }>("/api/tags", { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setTags(result.tags);
          setTagError("");
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setTagError(errorMessage(error));
      });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || tagsOnly || actionsOnly) return;
    const controller = new AbortController();
    const timeout = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const url = trimmedQuery
            ? `/api/search?q=${encodeURIComponent(trimmedQuery)}&limit=12`
            : "/api/items?archive=active&limit=5";
          const result = await api<{ items: ItemSummary[] }>(url, {
            signal: controller.signal,
          });
          if (!controller.signal.aborted) {
            setItems(result.items);
            setSelected(0);
          }
        } catch (error) {
          if (!controller.signal.aborted) setError(errorMessage(error));
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      trimmedQuery ? 180 : 0,
    );
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery, open, tagsOnly, actionsOnly]);

  const visibleTags =
    !actionsOnly && trimmedQuery
      ? tags
          .filter((tag) => tag.name.toLocaleLowerCase("it-IT").includes(filter))
          .slice(0, 5)
      : [];
  const visibleActions = tagsOnly
    ? []
    : actions
        .filter(
          (action) =>
            !filter ||
            `${action.title} ${action.keywords}`
              .toLocaleLowerCase("it-IT")
              .includes(filter),
        )
        .sort(
          (left, right) =>
            Number(right.title.toLocaleLowerCase("it-IT").includes(filter)) -
            Number(left.title.toLocaleLowerCase("it-IT").includes(filter)),
        )
        .slice(0, actionsOnly ? actions.length : trimmedQuery ? 4 : 3);
  const groups: { label: string; entries: PaletteEntry[] }[] = [
    {
      label: trimmedQuery ? "Conoscenze" : "Recenti",
      entries:
        tagsOnly || actionsOnly
          ? []
          : items.map((item) => ({
              kind: "item",
              item,
              id: `search-${item.id}`,
            })),
    },
    {
      label: "Etichette",
      entries: visibleTags.map((tag) => ({
        kind: "tag",
        tag,
        id: `search-tag-${tag.id}`,
      })),
    },
    {
      label: "Azioni",
      entries: visibleActions.map((action) => ({
        kind: "action",
        action,
        id: `search-action-${action.id}`,
      })),
    },
  ];
  const entries = groups.flatMap((group) => group.entries);
  const activeIndex = Math.min(selected, Math.max(0, entries.length - 1));
  const activeId = entries[activeIndex]?.id;

  useEffect(() => {
    if (open)
      results.current
        ?.querySelector<HTMLElement>('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
  }, [activeId, open]);

  function activate(entry: PaletteEntry) {
    onOpenChange(false);
    if (entry.kind === "item") router.push(`/items/${entry.item.id}`);
    else if (entry.kind === "tag")
      router.push(`/tags?tag=${encodeURIComponent(entry.tag.name)}`);
    else if (entry.action.href) router.push(entry.action.href);
    else capture(entry.action.type, entry.action.inbox ?? false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Cerca in Synapse"
      description="Ritrova una conoscenza, un’etichetta o esegui un’azione."
      wide
      initialFocusRef={input}
      className="command-palette"
    >
      <div className="command-input">
        <Search size={19} aria-hidden="true" />
        <input
          ref={input}
          autoComplete="off"
          spellCheck={false}
          aria-label="Cerca nelle tue conoscenze"
          role="combobox"
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-expanded={entries.length > 0}
          aria-activedescendant={activeId}
          placeholder="Cerca un’idea o un’azione…"
          value={query}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim() !== trimmedQuery) {
              setItems([]);
              setSelected(0);
              setError("");
              setLoading(!/^[#>]/.test(value.trim()));
            }
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected(
                Math.min(activeIndex + 1, Math.max(0, entries.length - 1)),
              );
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(Math.max(activeIndex - 1, 0));
            }
            if (event.key === "Enter" && entries[activeIndex]) {
              event.preventDefault();
              activate(entries[activeIndex]);
            }
          }}
        />
        {loading && (
          <LoaderCircle
            size={15}
            className="spin command-spinner"
            aria-label="Ricerca in corso"
          />
        )}
      </div>
      <div
        ref={results}
        className="search-results"
        id="search-results"
        role="listbox"
        aria-label="Risultati di ricerca"
        aria-busy={loading}
      >
        {(error || (tagsOnly && tagError)) && (
          <p className="form-error command-error" role="alert">
            {error || tagError}
          </p>
        )}
        {groups
          .filter((group) => group.entries.length > 0)
          .map((group) => (
            <div
              className="command-group"
              role="group"
              aria-label={group.label}
              key={group.label}
            >
              <div className="command-group-title" aria-hidden="true">
                {group.label}
              </div>
              {group.entries.map((entry) => {
                const index = entries.indexOf(entry);
                const Icon = entry.kind === "action" ? entry.action.icon : Hash;
                const title =
                  entry.kind === "item"
                    ? entry.item.title
                    : entry.kind === "tag"
                      ? entry.tag.name
                      : entry.action.title;
                const description =
                  entry.kind === "item"
                    ? entry.item.snippet
                    : entry.kind === "tag"
                      ? `${entry.tag.count || 0} ${(entry.tag.count || 0) === 1 ? "elemento collegato" : "elementi collegati"}`
                      : entry.action.description;
                return (
                  <button
                    type="button"
                    tabIndex={-1}
                    key={entry.id}
                    id={entry.id}
                    role="option"
                    aria-selected={activeIndex === index}
                    className={`search-result command-${entry.kind}`}
                    onMouseMove={() => setSelected(index)}
                    onClick={() => activate(entry)}
                  >
                    <span
                      className={`command-result-icon ${entry.kind === "item" ? `type-${entry.item.type.toLowerCase()}` : ""}`}
                    >
                      {entry.kind === "item" ? (
                        <TypeIcon type={entry.item.type} size={17} />
                      ) : (
                        <Icon size={17} aria-hidden="true" />
                      )}
                    </span>
                    <span className="command-result-copy">
                      <span className="search-result-title">{title}</span>
                      {description && (
                        <span className="command-result-description">
                          {description}
                        </span>
                      )}
                    </span>
                    {entry.kind === "item" && (
                      <span className="command-result-type">
                        {entry.item.archivedAt
                          ? "Archiviato"
                          : typeLabels[entry.item.type]}
                      </span>
                    )}
                    <ArrowUpRight
                      className="command-result-arrow"
                      size={14}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
          ))}
        {!loading && !error && !(tagsOnly && tagError) && !entries.length && (
          <div className="command-empty">
            <Search size={22} aria-hidden="true" />
            <p>Nessun risultato</p>
            <span>Prova un’altra parola, oppure usa # per le etichette.</span>
          </div>
        )}
        {loading && !entries.length && (
          <p className="search-message" role="status">
            Ricerca in corso…
          </p>
        )}
      </div>
      <div className="command-footer" aria-label="Scorciatoie di ricerca">
        <span>
          <span className="command-keys">
            <kbd>↑</kbd>
            <kbd>↓</kbd>
          </span>{" "}
          Naviga
        </span>
        <span>
          <kbd>
            <CornerDownLeft size={10} aria-hidden="true" />
          </kbd>{" "}
          Apri
        </span>
        <span className="command-mode-hint">
          <kbd>&gt;</kbd> Azioni <kbd>#</kbd> Etichette
        </span>
        <span className="command-close-hint">
          <kbd>esc</kbd> Chiudi
        </span>
      </div>
    </Modal>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Focus,
  ListTodo,
  Pause,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  PlannerData,
  TimeBlockCategory,
  TimeBlockSummary,
} from "@/domain/types";
import { getItemHref } from "@/domain/item-url";
import { Modal } from "@/components/ui";
import { api, changed, errorMessage } from "@/features/items/api";
import { useRemote } from "@/features/items/use-remote";
import { useWorkspace } from "@/components/workspace-context";
import {
  HOUR_HEIGHT,
  PLANNER_TIME_ZONE,
  dateInTimeZone,
  dayBounds,
  editorDateTime,
  hourMarkersForDay,
  positionBlocksForDay,
  zonedDateTimeToUtc,
} from "./time-layout";
import "./planner.css";

const categoryLabels: Record<TimeBlockCategory, string> = {
  WORK: "Lavoro",
  STUDY: "Studio",
  TRAINING: "Allenamento",
  BREAK: "Pausa",
  PERSONAL: "Personale",
  OTHER: "Altro",
};
const addDays = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const startOfWeek = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((value.getUTCDay() + 6) % 7));
};
const formatTime = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: PLANNER_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: PLANNER_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(zonedDateTimeToUtc(value, 12));
const inputValue = (value: string) =>
  `${dateInTimeZone(value)}T${formatTime(value)}`;
const inputToUtc = (value: string) => {
  const [date, time] = value.split("T");
  const [hour, minute] = time.split(":").map(Number);
  return zonedDateTimeToUtc(date, hour, minute).toISOString();
};
type EditorSeed = {
  itemId?: string;
  title?: string;
  day?: string;
  hour?: number;
};

export function Planner({
  initialView = "day",
}: {
  initialView?: "day" | "week";
}) {
  const [view, setView] = useState<"day" | "week">(initialView);
  const [selected, setSelected] = useState(() => dateInTimeZone(new Date()));
  const [editor, setEditor] = useState<TimeBlockSummary | "new" | null>(null);
  const [seed, setSeed] = useState<EditorSeed | null>(null);
  const [focus, setFocus] = useState<TimeBlockSummary | null>(null);
  const origin = view === "week" ? startOfWeek(selected) : selected;
  const range = useMemo(
    () => ({
      from: dayBounds(origin).start.toISOString(),
      to: dayBounds(
        addDays(origin, view === "week" ? 7 : 1),
      ).start.toISOString(),
    }),
    [origin, view],
  );
  const { data, loading, error, reload } = useRemote<PlannerData>(
    `/api/planner?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`,
  );
  const days = Array.from({ length: view === "week" ? 7 : 1 }, (_, index) =>
    addDays(origin, index),
  );
  const openNew = (next: EditorSeed = {}) => {
    setSeed({ day: selected, hour: 9, ...next });
    setEditor("new");
  };
  const move = (offset: number) =>
    setSelected(addDays(selected, offset * (view === "week" ? 7 : 1)));
  return (
    <div className="page planner-page">
      <header className="planner-header">
        <div>
          <p className="eyebrow">Pianificazione personale</p>
          <h1>Planner</h1>
          <p>Organizza il tempo che vuoi dedicare alle idee che contano.</p>
        </div>
        <div className="planner-top-actions">
          <Link
            href={view === "week" ? "/planner" : "/planner/week"}
            className="button button-secondary"
          >
            <CalendarDays size={15} />
            {view === "week" ? "Giorno" : "Settimana"}
          </Link>
          <button className="button button-primary" onClick={() => openNew()}>
            <Plus size={16} />
            Nuovo blocco
          </button>
        </div>
      </header>
      <div className="planner-toolbar">
        <div className="planner-nav">
          <button
            className="icon-button"
            aria-label="Periodo precedente"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="planner-date-button"
            onClick={() => setSelected(dateInTimeZone(new Date()))}
          >
            {view === "week"
              ? `Settimana del ${formatDate(days[0])}`
              : formatDate(selected)}
          </button>
          <button
            className="icon-button"
            aria-label="Periodo successivo"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button
          className="button button-ghost compact"
          onClick={() => setSelected(dateInTimeZone(new Date()))}
        >
          Oggi
        </button>
      </div>
      {error ? (
        <div className="error-banner">
          {error}{" "}
          <button className="text-link" onClick={reload}>
            Riprova
          </button>
        </div>
      ) : loading && !data ? (
        <div className="planner-loading">Caricamento del piano…</div>
      ) : (
        data && (
          <>
            <section
              className="planner-summary"
              aria-label="Riepilogo del tempo pianificato"
            >
              {Object.entries(data.summary)
                .filter(([, value]) => value.planned || value.actual)
                .map(([category, value]) => (
                  <div key={category}>
                    <span className={`planner-dot category-${category}`} />
                    <strong>
                      {categoryLabels[category as TimeBlockCategory]}
                    </strong>
                    <small>
                      {hours(value.planned)} pianificate · {hours(value.actual)}{" "}
                      registrate
                    </small>
                  </div>
                ))}
              {!Object.values(data.summary).some((value) => value.planned) && (
                <p>
                  Inizia con un blocco: il tuo piano resterà collegato al resto
                  di Synapse.
                </p>
              )}
            </section>
            <div className="planner-layout">
              <section
                className="planner-calendar"
                aria-label={
                  view === "week"
                    ? "Calendario settimanale"
                    : "Agenda giornaliera"
                }
              >
                {view === "week" ? (
                  <WeekGrid
                    days={days}
                    blocks={data.blocks}
                    onSelectDay={(day) => {
                      setSelected(day);
                      setView("day");
                    }}
                    onEdit={setEditor}
                    onNew={(day, hour) => openNew({ day, hour })}
                  />
                ) : (
                  <DayTimeline
                    day={selected}
                    blocks={data.blocks}
                    onEdit={setEditor}
                    onNew={(hour) => openNew({ hour })}
                  />
                )}
              </section>
              <aside className="planner-side">
                <Tasks
                  tasks={data.tasks}
                  onSchedule={(task) =>
                    openNew({ itemId: task.id, title: task.title })
                  }
                />
                <Templates
                  templates={data.templates}
                  day={selected}
                  onApplied={() => {
                    changed();
                    reload();
                  }}
                />
              </aside>
            </div>
          </>
        )
      )}
      {editor && (
        <BlockEditor
          block={editor === "new" ? null : editor}
          day={seed?.day ?? selected}
          initialHour={seed?.hour}
          seed={seed}
          onClose={() => {
            setEditor(null);
            setSeed(null);
          }}
          onSaved={() => {
            changed();
            reload();
            setEditor(null);
            setSeed(null);
          }}
          onFocus={setFocus}
        />
      )}{" "}
      {focus && (
        <FocusMode
          block={focus}
          onClose={() => setFocus(null)}
          onSaved={() => {
            changed();
            reload();
          }}
        />
      )}
    </div>
  );
}

function DayTimeline({
  day,
  blocks,
  onEdit,
  onNew,
}: {
  day: string;
  blocks: TimeBlockSummary[];
  onEdit: (block: TimeBlockSummary) => void;
  onNew: (hour: number) => void;
}) {
  const markers = hourMarkersForDay(day);
  const positioned = positionBlocksForDay(blocks, day);
  const height = (dayBounds(day).minutes * HOUR_HEIGHT) / 60;
  return (
    <div className="timeline">
      <div className="timeline-heading">
        <span>Orario</span>
        <span>{formatDate(day)}</span>
      </div>
      <div
        className="timeline-body"
        style={{ "--timeline-height": `${height}px` } as React.CSSProperties}
      >
        <TimeRuler markers={markers} />
        <div className="timeline-surface">
          <GridLines markers={markers} />
          <EmptySlots day={day} markers={markers} onNew={onNew} />
          <EventLayer events={positioned} onEdit={onEdit} />
        </div>
      </div>
    </div>
  );
}
function WeekGrid({
  days,
  blocks,
  onSelectDay,
  onEdit,
  onNew,
}: {
  days: string[];
  blocks: TimeBlockSummary[];
  onSelectDay: (day: string) => void;
  onEdit: (block: TimeBlockSummary) => void;
  onNew: (day: string, hour: number) => void;
}) {
  const height = Math.max(
    ...days.map((day) => (dayBounds(day).minutes * HOUR_HEIGHT) / 60),
  );
  const markers = hourMarkersForDay(days[0]);
  return (
    <div className="week-grid">
      <div className="week-head">
        <span />{" "}
        {days.map((day) => (
          <button key={day} onClick={() => onSelectDay(day)}>
            <strong>
              {new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(
                zonedDateTimeToUtc(day, 12),
              )}
            </strong>
            <span>
              {new Intl.DateTimeFormat("it-IT", { day: "numeric" }).format(
                zonedDateTimeToUtc(day, 12),
              )}
            </span>
          </button>
        ))}
      </div>
      <div
        className="week-body"
        style={{ "--timeline-height": `${height}px` } as React.CSSProperties}
      >
        <TimeRuler markers={markers} />
        <div className="week-days">
          {days.map((day) => {
            const dayMarkers = hourMarkersForDay(day);
            return (
              <div className="week-day" key={day}>
                <GridLines markers={dayMarkers} />
                <EmptySlots
                  day={day}
                  markers={dayMarkers}
                  onNew={(hour) => onNew(day, hour)}
                />
                <EventLayer
                  events={positionBlocksForDay(blocks, day)}
                  onEdit={onEdit}
                  compact
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
function TimeRuler({ markers }: { markers: { hour: number; top: number }[] }) {
  return (
    <div className="time-ruler" aria-hidden="true">
      {markers.slice(0, -1).map((marker) => (
        <time key={marker.hour} style={{ top: marker.top }}>
          {String(marker.hour).padStart(2, "0")}:00
        </time>
      ))}
    </div>
  );
}
function GridLines({ markers }: { markers: { hour: number; top: number }[] }) {
  return (
    <div className="time-grid" aria-hidden="true">
      {markers.map((marker) => (
        <span key={marker.hour} style={{ top: marker.top }} />
      ))}
    </div>
  );
}
function EmptySlots({
  day,
  markers,
  onNew,
}: {
  day: string;
  markers: { hour: number; top: number }[];
  onNew: (hour: number) => void;
}) {
  return (
    <div className="empty-slots">
      {markers.slice(0, -1).map((marker, index) => (
        <button
          key={marker.hour}
          className="timeline-add"
          aria-label={`Aggiungi un blocco il ${day} alle ${String(marker.hour).padStart(2, "0")}:00`}
          style={{
            top: marker.top,
            height: markers[index + 1].top - marker.top,
          }}
          onClick={() => onNew(marker.hour)}
        >
          <Plus size={14} />
        </button>
      ))}
    </div>
  );
}
function EventLayer({
  events,
  onEdit,
  compact = false,
}: {
  events: ReturnType<typeof positionBlocksForDay>;
  onEdit: (block: TimeBlockSummary) => void;
  compact?: boolean;
}) {
  return (
    <div className="event-layer">
      {events.map((event) => (
        <BlockCard
          key={event.block.id}
          block={event.block}
          compact={compact}
          onClick={() => onEdit(event.block)}
          style={{
            top: event.top,
            height: event.height,
            left: `calc(${(event.column / event.columns) * 100}% + 4px)`,
            width: `calc(${100 / event.columns}% - 8px)`,
          }}
        />
      ))}
    </div>
  );
}
function BlockCard({
  block,
  onClick,
  compact,
  style,
}: {
  block: TimeBlockSummary;
  onClick: () => void;
  compact?: boolean;
  style: React.CSSProperties;
}) {
  return (
    <button
      className={`time-block category-${block.category} ${block.status.toLowerCase()} ${compact ? "compact-block" : ""}`}
      onClick={onClick}
      style={style}
      title={`${block.title}, ${formatTime(block.startsAt)}–${formatTime(block.endsAt)}`}
    >
      <span className="time-block-time">
        {formatTime(block.startsAt)}–{formatTime(block.endsAt)}
      </span>
      <strong>{block.title}</strong>
      {!compact && (
        <span className="time-block-meta">
          {categoryLabels[block.category]}
          {block.item && ` · ${block.item.title}`}
          {block.conflict && " · Sovrapposto"}
        </span>
      )}
    </button>
  );
}
function Tasks({
  tasks,
  onSchedule,
}: {
  tasks: PlannerData["tasks"];
  onSchedule: (task: PlannerData["tasks"][number]) => void;
}) {
  return (
    <section className="planner-panel">
      <div className="panel-title">
        <ListTodo size={16} />
        <h2>Attività aperte</h2>
      </div>
      {tasks.length ? (
        tasks.map((task) => (
          <div className="planner-task" key={task.id}>
            <Link href={getItemHref(task)}>{task.title}</Link>
            <small>
              {task.dueAt
                ? `Scade ${new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "short" }).format(new Date(task.dueAt))}`
                : "Senza scadenza"}
            </small>
            <button className="text-link" onClick={() => onSchedule(task)}>
              Pianifica
            </button>
          </div>
        ))
      ) : (
        <p className="muted">Non ci sono attività aperte.</p>
      )}
    </section>
  );
}
function Templates({
  templates,
  day,
  onApplied,
}: {
  templates: PlannerData["templates"];
  day: string;
  onApplied: () => void;
}) {
  const { notify } = useWorkspace();
  async function apply(template: PlannerData["templates"][number]) {
    const blocks = Array.isArray(template.blocks) ? template.blocks : [];
    if (
      !window.confirm(
        `Applicare “${template.name}” a ${formatDate(day)}? I blocchi esistenti non verranno modificati.`,
      )
    )
      return;
    try {
      await Promise.all(
        blocks.map((raw) => {
          const block = raw as {
            title: string;
            description?: string;
            category: TimeBlockCategory;
            startsAt: string;
            endsAt: string;
            itemId?: string | null;
          };
          const start = new Date(block.startsAt);
          const end = new Date(block.endsAt);
          return api("/api/planner", {
            method: "POST",
            body: JSON.stringify({
              ...block,
              startsAt: zonedDateTimeToUtc(
                day,
                start.getHours(),
                start.getMinutes(),
              ).toISOString(),
              endsAt: zonedDateTimeToUtc(
                day,
                end.getHours(),
                end.getMinutes(),
              ).toISOString(),
              recurrence: null,
            }),
          });
        }),
      );
      notify("Template applicato senza modificare i blocchi presenti.");
      onApplied();
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  return (
    <section className="planner-panel">
      <div className="panel-title">
        <Sparkles size={16} />
        <h2>Template del giorno</h2>
      </div>
      {templates.length ? (
        templates.map((template) => (
          <button
            className="template-row"
            key={template.id}
            onClick={() => apply(template)}
          >
            <span>{template.name}</span>
            <Copy size={14} />
          </button>
        ))
      ) : (
        <p className="muted">
          Salva una giornata dal menu di un blocco per riutilizzarla.
        </p>
      )}
    </section>
  );
}
function BlockEditor({
  block,
  day,
  initialHour = 9,
  seed,
  onClose,
  onSaved,
  onFocus,
}: {
  block: TimeBlockSummary | null;
  day: string;
  initialHour?: number;
  seed: EditorSeed | null;
  onClose: () => void;
  onSaved: () => void;
  onFocus: (block: TimeBlockSummary) => void;
}) {
  const { notify } = useWorkspace();
  const [title, setTitle] = useState(block?.title ?? seed?.title ?? "");
  const [startsAt, setStartsAt] = useState(
    block ? inputValue(block.startsAt) : editorDateTime(day, initialHour),
  );
  const [endsAt, setEndsAt] = useState(
    block
      ? inputValue(block.endsAt)
      : editorDateTime(day, Math.min(initialHour + 1, 23)),
  );
  const [category, setCategory] = useState<TimeBlockCategory>(
    block?.category ?? "OTHER",
  );
  const [description, setDescription] = useState(block?.description ?? "");
  const [itemId, setItemId] = useState(block?.itemId ?? seed?.itemId ?? "");
  const [recurring, setRecurring] = useState(Boolean(block?.recurrence));
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api(`/api/planner${block ? `/${block.id.split(":")[0]}` : ""}`, {
        method: block ? "PATCH" : "POST",
        body: JSON.stringify({
          title,
          startsAt: inputToUtc(startsAt),
          endsAt: inputToUtc(endsAt),
          category,
          description,
          itemId: itemId || null,
          timezone: PLANNER_TIME_ZONE,
          recurrence: recurring
            ? {
                frequency: "WEEKLY",
                weekdays: [new Date(`${startsAt}:00`).getDay()],
              }
            : null,
        }),
      });
      notify("Blocco salvato.");
      onSaved();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!block || !window.confirm(`Eliminare “${block.title}”?`)) return;
    try {
      await api(`/api/planner/${block.id.split(":")[0]}`, { method: "DELETE" });
      notify("Blocco eliminato.");
      onSaved();
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={block ? "Modifica blocco" : "Nuovo blocco"}
      description="Il blocco pianifica tempo; l’attività collegata resta indipendente."
      wide
    >
      <div className="block-form">
        <label>
          Titolo
          <input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Es. Scrivere la proposta"
          />
        </label>
        <div className="form-columns">
          <label>
            Inizio
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </label>
          <label>
            Fine
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </label>
        </div>
        <label>
          Categoria
          <select
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as TimeBlockCategory)
            }
          >
            {Object.entries(categoryLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Collega un elemento Synapse{" "}
          <span className="field-hint">
            ID opzionale: puoi copiare l’ID dalla pagina dell’elemento.
          </span>
          <input
            value={itemId}
            onChange={(event) => setItemId(event.target.value)}
            placeholder="ID di nota, attività o progetto"
          />
        </label>
        <label>
          Descrizione
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={3}
            placeholder="Contesto o intenzione per questa sessione"
          />
        </label>
        <label className="recurrence-toggle">
          <input
            type="checkbox"
            checked={recurring}
            onChange={(event) => setRecurring(event.target.checked)}
          />
          <span>Ripeti ogni settimana nello stesso giorno</span>
        </label>
      </div>
      <div className="dialog-footer">
        {block && (
          <>
            <button
              className="button button-ghost"
              onClick={() => onFocus(block)}
            >
              <Focus size={15} />
              Focus
            </button>
            <button className="button button-danger" onClick={remove}>
              <Trash2 size={15} />
              Elimina
            </button>
          </>
        )}
        <button className="button button-secondary" onClick={onClose}>
          Annulla
        </button>
        <button
          className="button button-primary"
          disabled={saving}
          onClick={save}
        >
          <Save size={15} />
          {saving ? "Salvataggio…" : "Salva"}
        </button>
      </div>
    </Modal>
  );
}
function FocusMode({
  block,
  onClose,
  onSaved,
}: {
  block: TimeBlockSummary;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { notify } = useWorkspace();
  const [running, setRunning] = useState(block.status === "IN_PROGRESS");
  async function toggle(action: "start" | "stop" | "complete") {
    try {
      await api(`/api/planner/${block.id.split(":")[0]}/focus`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setRunning(action === "start");
      notify(
        action === "complete"
          ? "Blocco completato."
          : action === "start"
            ? "Focus avviato."
            : "Focus in pausa.",
      );
      onSaved();
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Modalità Focus"
      description="Il tempo registrato resta salvato anche se chiudi o aggiorni la pagina."
    >
      <div className="focus-card">
        <Clock3 size={28} />
        <h3>{block.title}</h3>
        <p>
          {formatTime(block.startsAt)}–{formatTime(block.endsAt)} ·{" "}
          {categoryLabels[block.category]}
        </p>
        {block.item && (
          <Link href={getItemHref(block.item)}>Apri {block.item.title}</Link>
        )}
        <div className="focus-actions">
          {running ? (
            <button
              className="button button-secondary"
              onClick={() => toggle("stop")}
            >
              <Pause size={16} />
              Pausa
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={() => toggle("start")}
            >
              <Play size={16} />
              Avvia
            </button>
          )}
          <button
            className="button button-secondary"
            onClick={() => toggle("complete")}
          >
            <Check size={16} />
            Termina
          </button>
        </div>
      </div>
    </Modal>
  );
}
function hours(minutes: number) {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h ? `${h} h` : ""}${h && m ? " " : ""}${m ? `${m} min` : ""}`;
}

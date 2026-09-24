"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Focus,
  GripVertical,
  ListTodo,
  Pause,
  Play,
  Plus,
  Settings2,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  PlannerCategorySummary,
  PlannerData,
  TimeBlockSummary,
} from "@/domain/types";
import { getItemHref } from "@/domain/item-url";
import { Modal } from "@/components/ui";
import { AppSelect } from "@/components/select";
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

const categoryPalette = [
  "#8FA9FF",
  "#B59BE8",
  "#8DCAA5",
  "#D8BA78",
  "#E09AB9",
  "#E8917D",
  "#69B9B2",
  "#9DA5B2",
];
type RgbColor = { r: number; g: number; b: number };
type HsvColor = { h: number; s: number; v: number };
const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);
function hexToRgb(color: string): RgbColor {
  const match = /^#?([0-9a-f]{6})$/i.exec(color);
  const value = match?.[1] ?? "8FA9FF";
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}
function rgbToHex({ r, g, b }: RgbColor) {
  return `#${[r, g, b]
    .map((value) =>
      clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0"),
    )
    .join("")
    .toUpperCase()}`;
}
function rgbToHsv({ r, g, b }: RgbColor): HsvColor {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const hue = !delta
    ? 0
    : max === red
      ? 60 * (((green - blue) / delta) % 6)
      : max === green
        ? 60 * ((blue - red) / delta + 2)
        : 60 * ((red - green) / delta + 4);
  return {
    h: (hue + 360) % 360,
    s: max ? (delta / max) * 100 : 0,
    v: max * 100,
  };
}
function hsvToHex({ h, s, v }: HsvColor) {
  const saturation = clamp(s, 0, 100) / 100;
  const value = clamp(v, 0, 100) / 100;
  const chroma = value * saturation;
  const section = (((h % 360) + 360) % 360) / 60;
  const offset = chroma * (1 - Math.abs((section % 2) - 1));
  const match = value - chroma;
  const [red, green, blue] =
    section < 1
      ? [chroma, offset, 0]
      : section < 2
        ? [offset, chroma, 0]
        : section < 3
          ? [0, chroma, offset]
          : section < 4
            ? [0, offset, chroma]
            : section < 5
              ? [offset, 0, chroma]
              : [chroma, 0, offset];
  return rgbToHex({
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
  });
}
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
  const [hiddenCategoryIds, setHiddenCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
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
          <Link href="/settings#categorie" className="button button-secondary">
            <Settings2 size={15} />
            Categorie
          </Link>
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
              {data.summary
                .filter((value) => value.planned || value.actual)
                .map((value) => (
                  <div key={value.category.id}>
                    <span
                      className="planner-dot"
                      style={{ background: value.category.color }}
                    />
                    <strong>{value.category.name}</strong>
                    <small>
                      {hours(value.planned)} pianificate · {hours(value.actual)}{" "}
                      registrate
                    </small>
                  </div>
                ))}
              {!data.summary.some((value) => value.planned) && (
                <p>
                  Inizia con un blocco: il tuo piano resterà collegato al resto
                  di Synapse.
                </p>
              )}
            </section>
            <CategoryFilters
              categories={data.categories}
              hiddenCategoryIds={hiddenCategoryIds}
              onToggle={(id) =>
                setHiddenCategoryIds((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
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
                    blocks={data.blocks.filter(
                      (block) => !hiddenCategoryIds.has(block.categoryId),
                    )}
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
                    blocks={data.blocks.filter(
                      (block) => !hiddenCategoryIds.has(block.categoryId),
                    )}
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
          categories={data?.categories ?? []}
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
      className={`time-block ${block.status.toLowerCase()} ${compact ? "compact-block" : ""}`}
      onClick={onClick}
      style={
        {
          ...style,
          "--category-color": block.categoryColor ?? block.category.color,
        } as React.CSSProperties
      }
      title={`${block.title}, ${formatTime(block.startsAt)}–${formatTime(block.endsAt)}`}
    >
      <span className="time-block-time">
        {formatTime(block.startsAt)}–{formatTime(block.endsAt)}
      </span>
      <strong>{block.title}</strong>
      {!compact && (
        <span className="time-block-meta">
          {block.category.name}
          {block.item && ` · ${block.item.title}`}
          {block.conflict && " · Sovrapposto"}
        </span>
      )}
    </button>
  );
}
function CategoryFilters({
  categories,
  hiddenCategoryIds,
  onToggle,
}: {
  categories: PlannerCategorySummary[];
  hiddenCategoryIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <nav
      className="category-filters"
      aria-label="Filtra le categorie del planner"
    >
      <span>Mostra</span>
      {categories.map((category) => {
        const selected = !hiddenCategoryIds.has(category.id);
        return (
          <button
            key={category.id}
            className={selected ? "selected" : ""}
            aria-pressed={selected}
            onClick={() => onToggle(category.id)}
          >
            <i style={{ background: category.color }} aria-hidden="true" />
            {category.name}
            {category.archivedAt ? " (archiviata)" : ""}
          </button>
        );
      })}
    </nav>
  );
}
function CategoryColorControl({
  color,
  onChange,
  label,
  open,
  onOpenChange,
}: {
  color: string;
  onChange: (value: string) => void;
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(color)));
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() =>
      setHsv(rgbToHsv(hexToRgb(color))),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, color]);
  const rgb = hexToRgb(color);
  function setPickerColor(next: HsvColor) {
    setHsv(next);
    onChange(hsvToHex(next));
  }
  function chooseSpectrum(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    setPickerColor({
      h: hsv.h,
      s: clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100),
      v: clamp(
        (1 - (event.clientY - bounds.top) / bounds.height) * 100,
        0,
        100,
      ),
    });
  }
  function updateChannel(channel: keyof RgbColor, value: string) {
    onChange(
      rgbToHex({ ...rgb, [channel]: clamp(Number(value) || 0, 0, 255) }),
    );
  }
  return (
    <div className="category-color-control">
      <button
        type="button"
        className="category-color-button"
        style={{ "--selected-color": color } as React.CSSProperties}
        aria-label={label}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <span />
      </button>
      {open && (
        <div
          className="category-color-popover category-rgb-picker"
          role="dialog"
          aria-label="Scegli un colore RGB"
        >
          <strong>Colore</strong>
          <div
            className="category-color-spectrum"
            style={
              {
                "--picker-hue": `hsl(${hsv.h}, 100%, 50%)`,
                "--picker-x": `${hsv.s}%`,
                "--picker-y": `${100 - hsv.v}%`,
              } as React.CSSProperties
            }
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              chooseSpectrum(event);
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                chooseSpectrum(event);
            }}
          >
            <span aria-hidden="true" />
          </div>
          <label className="category-hue-control">
            Tonalità
            <input
              aria-label="Tonalità"
              type="range"
              min="0"
              max="360"
              value={Math.round(hsv.h)}
              onChange={(event) =>
                setPickerColor({ ...hsv, h: Number(event.target.value) })
              }
            />
          </label>
          <div className="category-rgb-fields" aria-label="Valori RGB">
            <label>
              R
              <input
                aria-label="Rosso"
                type="number"
                min="0"
                max="255"
                value={rgb.r}
                onChange={(event) => updateChannel("r", event.target.value)}
              />
            </label>
            <label>
              G
              <input
                aria-label="Verde"
                type="number"
                min="0"
                max="255"
                value={rgb.g}
                onChange={(event) => updateChannel("g", event.target.value)}
              />
            </label>
            <label>
              B
              <input
                aria-label="Blu"
                type="number"
                min="0"
                max="255"
                value={rgb.b}
                onChange={(event) => updateChannel("b", event.target.value)}
              />
            </label>
          </div>
          <div className="category-color-options" aria-label="Colori rapidi">
            {categoryPalette.map((option) => (
              <button
                key={option}
                type="button"
                className={option === color ? "selected" : ""}
                style={{ background: option }}
                aria-label={`Usa ${option}`}
                onClick={() => {
                  onChange(option);
                  setHsv(rgbToHsv(hexToRgb(option)));
                }}
              />
            ))}
          </div>
          <label className="category-hex-field">
            HEX
            <input
              value={color}
              maxLength={7}
              pattern="#[0-9a-fA-F]{6}"
              onChange={(event) => onChange(event.target.value.toUpperCase())}
            />
          </label>
        </div>
      )}
    </div>
  );
}
export function CategoryManager({
  categories,
  onClose,
  onChanged,
}: {
  categories: PlannerCategorySummary[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { notify } = useWorkspace();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const [openColorPicker, setOpenColorPicker] = useState<string | null>(null);
  const previewOrder = useMemo(() => {
    if (!draggedId || !dropTarget || draggedId === dropTarget.id)
      return categories.map((category) => category.id);
    const withoutDragged = categories.filter(
      (category) => category.id !== draggedId,
    );
    const targetIndex = withoutDragged.findIndex(
      (category) => category.id === dropTarget.id,
    );
    if (targetIndex < 0) return categories.map((category) => category.id);
    const destination = targetIndex + (dropTarget.position === "after" ? 1 : 0);
    return [
      ...withoutDragged.slice(0, destination),
      categories.find((category) => category.id === draggedId)!,
      ...withoutDragged.slice(destination),
    ].map((category) => category.id);
  }, [categories, draggedId, dropTarget]);
  async function reorder(target: { id: string; position: "before" | "after" }) {
    if (!draggedId || draggedId === target.id) return;
    const ordered = categories.filter((category) => category.id !== draggedId);
    const targetIndex = ordered.findIndex(
      (category) => category.id === target.id,
    );
    if (targetIndex < 0) return;
    try {
      await api(`/api/planner/categories/${draggedId}`, {
        method: "PATCH",
        body: JSON.stringify({
          sortOrder: targetIndex + (target.position === "after" ? 1 : 0),
        }),
      });
      onChanged();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setDraggedId(null);
      setDropTarget(null);
    }
  }
  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title="Categorie"
      description="Trascina la maniglia per ordinare; puoi modificare colore, nome e archivio."
      wide
    >
      <div className="category-manager">
        <CategoryCreateDialogInline
          onCreated={onChanged}
          pickerOpen={openColorPicker === "new"}
          onPickerOpenChange={(open) => setOpenColorPicker(open ? "new" : null)}
        />
        {categories.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            categories={categories}
            previewOrder={previewOrder}
            dragging={draggedId === category.id}
            onDragStart={() => {
              setDraggedId(category.id);
              setDropTarget(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDropTarget(null);
            }}
            onPreview={(position) => {
              if (draggedId)
                setDropTarget(
                  draggedId === category.id
                    ? null
                    : { id: category.id, position },
                );
            }}
            onDrop={(position) => reorder({ id: category.id, position })}
            onChanged={onChanged}
            pickerOpen={openColorPicker === category.id}
            onPickerOpenChange={(open) =>
              setOpenColorPicker(open ? category.id : null)
            }
          />
        ))}
      </div>
      <div className="dialog-footer">
        <button className="button button-primary" onClick={onClose}>
          Fine
        </button>
      </div>
    </Modal>
  );
}
function CategoryCreateDialogInline({
  onCreated,
  pickerOpen,
  onPickerOpenChange,
}: {
  onCreated: () => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const { notify } = useWorkspace();
  const [name, setName] = useState("");
  const [color, setColor] = useState(categoryPalette[0]);
  const [saving, setSaving] = useState(false);
  async function create() {
    setSaving(true);
    try {
      await api("/api/planner/categories", {
        method: "POST",
        body: JSON.stringify({ name, color }),
      });
      setName("");
      notify("Categoria creata.");
      onCreated();
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }
  return (
    <section
      className="category-create-inline"
      aria-labelledby="new-category-heading"
    >
      <div className="category-create-title">
        <Plus size={16} />
        <h3 id="new-category-heading">Nuova categoria</h3>
      </div>
      <label>
        Nome della categoria
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Es. Idee"
        />
      </label>
      <label className="category-color-field">
        Colore
        <CategoryColorControl
          color={color}
          onChange={setColor}
          label="Scegli il colore della nuova categoria"
          open={pickerOpen}
          onOpenChange={onPickerOpenChange}
        />
      </label>
      <button
        className="button button-primary"
        disabled={!name.trim() || saving}
        onClick={create}
      >
        {saving ? "Creazione…" : "Crea categoria"}
      </button>
    </section>
  );
}
function CategoryRow({
  category,
  categories,
  previewOrder,
  dragging,
  onDragStart,
  onDragEnd,
  onPreview,
  onDrop,
  onChanged,
  pickerOpen,
  onPickerOpenChange,
}: {
  category: PlannerCategorySummary;
  categories: PlannerCategorySummary[];
  previewOrder: string[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onPreview: (position: "before" | "after") => void;
  onDrop: (position: "before" | "after") => void;
  onChanged: () => void;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}) {
  const { notify } = useWorkspace();
  const [name, setName] = useState(category.name);
  const [color, setColor] = useState(category.color);
  const [replacement, setReplacement] = useState("");
  const [dragReady, setDragReady] = useState(false);
  async function patch(body: object, success: string) {
    try {
      await api(`/api/planner/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      notify(success);
      onChanged();
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  async function remove() {
    const moving = replacement || undefined;
    if (
      !window.confirm(
        moving
          ? `Eliminare “${category.name}” e spostare i suoi blocchi?`
          : `Eliminare “${category.name}”? Le categorie con blocchi vanno prima archiviate o riassegnate.`,
      )
    )
      return;
    try {
      await api(`/api/planner/categories/${category.id}`, {
        method: "DELETE",
        body: JSON.stringify(moving ? { reassignToId: moving } : {}),
      });
      notify("Categoria eliminata.");
      onChanged();
    } catch (error) {
      notify(errorMessage(error));
    }
  }
  return (
    <section
      className={`category-row ${category.archivedAt ? "archived" : ""} ${dragging ? "dragging" : ""}`}
      style={{ order: previewOrder.indexOf(category.id) }}
      draggable={dragReady}
      onDragStart={(event) => {
        if (!dragReady) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setDragImage(event.currentTarget, 20, 20);
        onDragStart();
      }}
      onDragEnd={() => {
        setDragReady(false);
        onDragEnd();
      }}
      onDragOver={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onPreview(
          event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        );
      }}
      onDrop={(event) => {
        event.preventDefault();
        const bounds = event.currentTarget.getBoundingClientRect();
        onDrop(
          event.clientY < bounds.top + bounds.height / 2 ? "before" : "after",
        );
      }}
    >
      <button
        type="button"
        className="category-drag-handle"
        onPointerDown={() => setDragReady(true)}
        onPointerUp={() => setDragReady(false)}
        aria-label={`Trascina ${category.name} per cambiare l’ordine`}
        title="Tieni premuto e trascina per riordinare"
      >
        <GripVertical size={18} />
      </button>
      <span
        className="category-swatch"
        style={{ background: color }}
        aria-hidden="true"
      />
      <div className="category-row-fields">
        <label>
          Nome
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="category-color-field">
          Colore
          <CategoryColorControl
            color={color}
            onChange={setColor}
            label={`Scegli il colore per ${category.name}`}
            open={pickerOpen}
            onOpenChange={onPickerOpenChange}
          />
        </label>
      </div>
      <div className="category-row-actions">
        <button
          className="button button-ghost compact"
          onClick={() => patch({ name, color }, "Categoria salvata.")}
        >
          Salva modifiche
        </button>
        <button
          className="button button-ghost compact"
          onClick={() =>
            patch(
              { archived: !category.archivedAt },
              category.archivedAt
                ? "Categoria ripristinata."
                : "Categoria archiviata.",
            )
          }
        >
          {category.archivedAt ? "Ripristina" : "Archivia"}
        </button>
      </div>
      <div className="category-delete">
        <label>
          Sposta i blocchi in
          <AppSelect
            value={replacement}
            onValueChange={setReplacement}
            aria-label={`Sposta i blocchi della categoria ${category.name}`}
            className="category-reassignment-select"
            options={[
              { value: "", label: "Non riassegnare" },
              ...categories
                .filter(
                  (value) => value.id !== category.id && !value.archivedAt,
                )
                .map((value) => ({ value: value.id, label: value.name })),
            ]}
          />
        </label>
        <button className="text-link" onClick={remove}>
          Elimina categoria
        </button>
      </div>
    </section>
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
    if (
      !window.confirm(
        `Applicare “${template.name}” a ${formatDate(day)}? I blocchi esistenti non verranno modificati.`,
      )
    )
      return;
    try {
      await api(`/api/planner/templates/${template.id}/apply`, {
        method: "POST",
        body: JSON.stringify({ date: day }),
      });
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
  categories,
  onClose,
  onSaved,
  onFocus,
}: {
  block: TimeBlockSummary | null;
  day: string;
  initialHour?: number;
  seed: EditorSeed | null;
  categories: PlannerCategorySummary[];
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
  const [categoryId, setCategoryId] = useState(
    block?.categoryId ??
      categories.find((category) => category.name === "Altro")?.id ??
      categories[0]?.id ??
      "",
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
          categoryId,
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
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories
              .filter(
                (category) =>
                  !category.archivedAt || category.id === block?.categoryId,
              )
              .map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
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
          {block.category.name}
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

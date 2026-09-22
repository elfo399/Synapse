import type { TimeBlockSummary } from "@/domain/types";

export const PLANNER_TIME_ZONE = "Europe/Rome";
export const HOUR_HEIGHT = 74;
export const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;

export interface PositionedTimeBlock {
  block: TimeBlockSummary;
  top: number;
  height: number;
  column: number;
  columns: number;
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsAt(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return values as ZonedParts;
}

function utcMillis(parts: ZonedParts): number {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

function addDays(date: string, amount: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + amount);
  return value.toISOString().slice(0, 10);
}

export function dateInTimeZone(
  value: Date | string,
  timeZone = PLANNER_TIME_ZONE,
): string {
  const parts = partsAt(new Date(value), timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/** Maps a civil clock value to an instant. Recalculating the offset handles DST boundaries. */
export function zonedDateTimeToUtc(
  date: string,
  hour: number,
  minute = 0,
  timeZone = PLANNER_TIME_ZONE,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wanted: ZonedParts = { year, month, day, hour, minute, second: 0 };
  const guess = new Date(utcMillis(wanted));
  const firstOffset = utcMillis(partsAt(guess, timeZone)) - guess.getTime();
  let result = new Date(guess.getTime() - firstOffset);
  const observed = partsAt(result, timeZone);
  result = new Date(result.getTime() + utcMillis(wanted) - utcMillis(observed));
  return result;
}

export function dayBounds(date: string, timeZone = PLANNER_TIME_ZONE) {
  const start = zonedDateTimeToUtc(date, 0, 0, timeZone);
  const end = zonedDateTimeToUtc(addDays(date, 1), 0, 0, timeZone);
  return { start, end, minutes: (end.getTime() - start.getTime()) / 60_000 };
}

export function editorDateTime(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, "0")}:00`;
}

function collisionLayout(
  events: Array<Omit<PositionedTimeBlock, "column" | "columns">>,
): PositionedTimeBlock[] {
  const result: PositionedTimeBlock[] = [];
  const sorted = [...events].sort(
    (left, right) => left.top - right.top || left.height - right.height,
  );
  let index = 0;
  while (index < sorted.length) {
    const group = [sorted[index++]];
    let groupEnd = group[0].top + group[0].height;
    while (index < sorted.length && sorted[index].top < groupEnd) {
      group.push(sorted[index]);
      groupEnd = Math.max(groupEnd, sorted[index].top + sorted[index].height);
      index += 1;
    }
    const columnEnds: number[] = [];
    const assigned = group.map((event) => {
      let column = columnEnds.findIndex((end) => end <= event.top);
      if (column < 0) {
        column = columnEnds.length;
        columnEnds.push(0);
      }
      columnEnds[column] = event.top + event.height;
      return { ...event, column };
    });
    result.push(
      ...assigned.map((event) => ({ ...event, columns: columnEnds.length })),
    );
  }
  return result;
}

/** Clips blocks to one displayed civil day, then assigns non-overlapping columns. */
export function positionBlocksForDay(
  blocks: TimeBlockSummary[],
  date: string,
  timeZone = PLANNER_TIME_ZONE,
): PositionedTimeBlock[] {
  const { start, end } = dayBounds(date, timeZone);
  const events = blocks.flatMap((block) => {
    const blockStart = new Date(block.startsAt);
    const blockEnd = new Date(block.endsAt);
    const visibleStart = new Date(
      Math.max(blockStart.getTime(), start.getTime()),
    );
    const visibleEnd = new Date(Math.min(blockEnd.getTime(), end.getTime()));
    if (visibleEnd <= visibleStart) return [];
    return [
      {
        block,
        top:
          ((visibleStart.getTime() - start.getTime()) / 60_000) *
          PIXELS_PER_MINUTE,
        height: Math.max(
          20,
          ((visibleEnd.getTime() - visibleStart.getTime()) / 60_000) *
            PIXELS_PER_MINUTE,
        ),
      },
    ];
  });
  return collisionLayout(events);
}

export function hourMarkersForDay(date: string, timeZone = PLANNER_TIME_ZONE) {
  const { start, end } = dayBounds(date, timeZone);
  return Array.from({ length: 25 }, (_, hour) => {
    const marker =
      hour === 24 ? end : zonedDateTimeToUtc(date, hour, 0, timeZone);
    return {
      hour,
      top: Math.max(
        0,
        Math.min(
          ((end.getTime() - start.getTime()) / 60_000) * PIXELS_PER_MINUTE,
          ((marker.getTime() - start.getTime()) / 60_000) * PIXELS_PER_MINUTE,
        ),
      ),
    };
  }).filter(
    (marker, index, markers) =>
      index === 0 || marker.top > markers[index - 1].top,
  );
}

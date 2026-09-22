import { describe, expect, it } from "vitest";
import type { TimeBlockSummary } from "@/domain/types";
import {
  HOUR_HEIGHT,
  dayBounds,
  editorDateTime,
  positionBlocksForDay,
} from "@/features/planner/time-layout";

const block = (startsAt: string, endsAt: string): TimeBlockSummary => ({
  id: startsAt,
  title: "Blocco",
  description: "",
  startsAt,
  endsAt,
  timezone: "Europe/Rome",
  categoryId: "work",
  categoryColor: "#8FA9FF",
  category: { id: "work", name: "Lavoro", color: "#8FA9FF", icon: null, sortOrder: 0, archivedAt: null },
  status: "PLANNED",
  itemId: null,
  recurrence: null,
  actualMinutes: 0,
  conflict: false,
});

describe("layout temporale del Planner", () => {
  it("posiziona e dimensiona blocchi in base ai minuti", () => {
    const [long, partial, short] = positionBlocksForDay(
      [
        block("2026-09-22T07:00:00.000Z", "2026-09-22T11:00:00.000Z"),
        block("2026-09-22T07:30:00.000Z", "2026-09-22T08:15:00.000Z"),
        block("2026-09-22T10:00:00.000Z", "2026-09-22T10:30:00.000Z"),
      ],
      "2026-09-22",
    );
    expect(long.top).toBe(9 * HOUR_HEIGHT);
    expect(long.height).toBe(4 * HOUR_HEIGHT);
    expect(partial.top).toBe(9.5 * HOUR_HEIGHT);
    expect(partial.height).toBe(0.75 * HOUR_HEIGHT);
    expect(short.height).toBe(0.5 * HOUR_HEIGHT);
  });
  it("affianca i blocchi che si sovrappongono", () => {
    const events = positionBlocksForDay(
      [
        block("2026-09-22T07:00:00.000Z", "2026-09-22T08:00:00.000Z"),
        block("2026-09-22T07:30:00.000Z", "2026-09-22T09:00:00.000Z"),
      ],
      "2026-09-22",
    );
    expect(events.map((event) => event.column)).toEqual([0, 1]);
    expect(events.map((event) => event.columns)).toEqual([2, 2]);
  });
  it("ritaglia un blocco che attraversa mezzanotte", () => {
    const [event] = positionBlocksForDay(
      [block("2026-09-22T21:00:00.000Z", "2026-09-22T23:00:00.000Z")],
      "2026-09-22",
    );
    expect(event.top).toBe(23 * HOUR_HEIGHT);
    expect(event.height).toBe(HOUR_HEIGHT);
  });
  it("calcola giornate DST con durata reale", () => {
    expect(dayBounds("2026-03-29").minutes).toBe(23 * 60);
    expect(dayBounds("2026-10-25").minutes).toBe(25 * 60);
  });
  it("posiziona nella data locale corretta anche un evento settimanale in UTC", () => {
    const [event] = positionBlocksForDay(
      [block("2026-09-21T22:30:00.000Z", "2026-09-21T23:30:00.000Z")],
      "2026-09-22",
    );
    expect(event.top).toBe(0.5 * HOUR_HEIGHT);
    expect(event.height).toBe(HOUR_HEIGHT);
  });
  it("prepara l’orario selezionato per un click su una fascia vuota", () => {
    expect(editorDateTime("2026-09-22", 15)).toBe("2026-09-22T15:00");
  });
});

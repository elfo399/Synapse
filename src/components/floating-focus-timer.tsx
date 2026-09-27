"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, ExternalLink, Pause, Play, Square, Timer } from "lucide-react";
import Link from "next/link";
import { api, errorMessage } from "@/features/items/api";
import { getItemHref } from "@/domain/item-url";
import { useWorkspace } from "./workspace-context";
import { Modal } from "./ui";
import "./floating-focus-timer.css";

type Focus = {
  paused: boolean;
  status: "RUNNING" | "PAUSED";
  startedAt: string;
  accumulatedSeconds: number;
  currentFocusSeconds: number;
  totalSeconds: number;
  todaySeconds: number;
  plannedSeconds: number;
  measuredAt: string;
  segments: number;
  block: { id: string; title: string; startsAt: string; endsAt: string; category: string; item: { id: string; title: string; itemKey: string | null } | null };
};
type Completed = { focus: Focus; seconds: number };
function label(seconds: number) { const value = Math.max(0, seconds); return [Math.floor(value / 3600), Math.floor((value % 3600) / 60), value % 60].map((part) => String(part).padStart(2, "0")).join(":"); }
function minutes(seconds: number) { const value = Math.max(0, Math.round(seconds / 60)); return value >= 60 ? `${Math.floor(value / 60)} h${value % 60 ? ` ${value % 60} min` : ""}` : `${value} min`; }
function broadcastFocusChange() { window.dispatchEvent(new Event("synapse:focus-changed")); try { window.localStorage.setItem("synapse:focus-changed", String(Date.now())); } catch { /* Private browsing can block localStorage. */ } }

export function FloatingFocusTimer() {
  const { notify } = useWorkspace();
  const [focus, setFocus] = useState<Focus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [completed, setCompleted] = useState<Completed | null>(null);
  const load = useCallback(async () => { try { setFocus((await api<{ focus: Focus | null }>("/api/focus/active")).focus); setNow(Date.now()); } catch { /* A later visibility or network event retries without polling. */ } }, []);
  useEffect(() => {
    void load();
    const sync = () => void load();
    const storage = (event: StorageEvent) => { if (event.key === "synapse:focus-changed") sync(); };
    window.addEventListener("focus", sync); window.addEventListener("online", sync); window.addEventListener("synapse:focus-changed", sync); window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", sync);
    return () => { window.removeEventListener("focus", sync); window.removeEventListener("online", sync); window.removeEventListener("synapse:focus-changed", sync); window.removeEventListener("storage", storage); document.removeEventListener("visibilitychange", sync); };
  }, [load]);
  useEffect(() => { if (!focus || focus.paused) return; const interval = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(interval); }, [focus]);
  const elapsedSinceSync = focus && !focus.paused ? Math.max(0, Math.floor((now - new Date(focus.measuredAt).getTime()) / 1000)) : 0;
  const totals = useMemo(() => focus ? {
    current: focus.currentFocusSeconds + elapsedSinceSync,
    total: focus.totalSeconds + elapsedSinceSync,
    today: focus.todaySeconds + elapsedSinceSync,
  } : null, [focus, elapsedSinceSync]);
  async function mutate(action: "pause" | "resume" | "stop") {
    if (!focus || busy) return;
    setBusy(true);
    try {
      const before = focus;
      const beforeElapsed = totals?.current ?? before.currentFocusSeconds;
      const result = await api<{ focus: Focus | null }>("/api/focus/active", { method: "POST", body: JSON.stringify({ action }) });
      if (action === "stop") { setCompleted({ focus: before, seconds: beforeElapsed }); setOpen(false); notify("Sessione Focus terminata."); }
      setFocus(result.focus); setNow(Date.now()); broadcastFocusChange();
    } catch (error) { notify(errorMessage(error)); }
    finally { setBusy(false); }
  }
  const summary = focus && totals ? <FocusSummary focus={focus} current={totals.current} total={totals.total} today={totals.today} /> : null;
  if (!focus) return completed ? <Modal open onOpenChange={(isOpen) => !isOpen && setCompleted(null)} title="Focus terminato" description="Il tempo ? stato conservato nel Planner."><FocusSummary focus={completed.focus} current={completed.seconds} total={completed.focus.totalSeconds} today={completed.focus.todaySeconds} /><div className="dialog-footer"><button className="button button-primary" onClick={() => setCompleted(null)}>Chiudi</button></div></Modal> : null;
  return <>
    <aside className="floating-focus-timer" aria-label="Timer Focus attivo">
      <span className={`focus-state ${focus.paused ? "paused" : ""}`}><Timer size={15} /> {focus.paused ? "In pausa" : "Focus"}</span>
      <div className="focus-title"><strong>{focus.block.item?.itemKey && `${focus.block.item.itemKey} ? `}{focus.block.item?.title ?? focus.block.title}</strong><small>{focus.block.item ? focus.block.title : focus.block.category}</small></div>
      <time>{label(totals?.current ?? 0)}</time>
      <button className="button button-secondary compact" disabled={busy} onClick={() => void mutate(focus.paused ? "resume" : "pause")}>{focus.paused ? <Play size={15} /> : <Pause size={15} />}{focus.paused ? "Riprendi" : "Pausa"}</button>
      <button className="icon-button" aria-label="Termina Focus" title="Termina Focus" disabled={busy} onClick={() => void mutate("stop")}><Square size={16} /></button>
      <button className="icon-button" aria-label="Apri riepilogo Focus" title="Apri riepilogo Focus" onClick={() => setOpen(true)}><BarChart3 size={16} /></button>
    </aside>
    <Modal open={open} onOpenChange={setOpen} title="Riepilogo Focus" description="Tempo registrato per il blocco corrente.">{summary}<div className="dialog-footer">{focus.block.item && <Link className="button button-secondary" href={getItemHref(focus.block.item)} onClick={() => setOpen(false)}><ExternalLink size={15} /> Apri attivit?</Link>}<Link className="button button-secondary" href="/planner" onClick={() => setOpen(false)}>Apri nel Planner</Link><button className="button button-primary" onClick={() => setOpen(false)}>Chiudi</button></div></Modal>
  </>;
}
function FocusSummary({ focus, current, total, today }: { focus: Focus; current: number; total: number; today: number }) {
  const remaining = focus.plannedSeconds - total;
  const progress = focus.plannedSeconds ? Math.min(100, (total / focus.plannedSeconds) * 100) : 0;
  return <div className="focus-summary"><div><dt>Attivit?</dt><dd>{focus.block.item ? `${focus.block.item.itemKey ?? ""} ? ${focus.block.item.title}` : "Nessuna attivit? collegata"}</dd></div><div><dt>Blocco</dt><dd>{focus.block.title}</dd></div><div><dt>Tempo pianificato</dt><dd>{minutes(focus.plannedSeconds)}</dd></div><div><dt>Registrato oggi</dt><dd>{minutes(today)}</dd></div><div><dt>Registrato nel blocco</dt><dd>{minutes(total)}</dd></div><div><dt>Sessione corrente</dt><dd>{minutes(current)}</dd></div><div><dt>Sessioni Focus</dt><dd>{focus.segments}</dd></div><div><dt>{remaining >= 0 ? "Tempo rimanente" : "Sforamento"}</dt><dd>{minutes(Math.abs(remaining))}</dd></div><div className="focus-progress"><span><i style={{ width: `${progress}%` }} /></span><small>{Math.round(progress)}% del tempo pianificato</small></div></div>;
}

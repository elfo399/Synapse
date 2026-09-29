"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CheckCircle, Save } from "lucide-react";
import { useRemote } from "@/features/items/use-remote";
import { api, errorMessage } from "@/features/items/api";
import { getItemHref } from "@/domain/item-url";
import "@/features/notifications/notifications.css";

type Item = { id: string; itemKey: string | null; title: string };
type Data = { completed: number; inbox: number; overdue: Item[]; upcoming: Item[]; inactive: Item[]; review: { notes: string; completedAt: string | null } };

export function WeeklyReviewPage() {
  const { data, reload } = useRemote<Data>("/api/weekly-review");
  const [notes, setNotes] = useState<string | null>(null);
  const [saving, setSaving] = useState<"notes" | "complete" | null>(null);
  const [feedback, setFeedback] = useState("");
  useEffect(() => { if (data) setNotes(data.review.notes); }, [data?.review.notes]);
  if (!data) return <div className="page weekly-review-page">Caricamento…</div>;
  const save = async (done: boolean) => {
    setSaving(done ? "complete" : "notes"); setFeedback("");
    try {
      await api("/api/weekly-review", { method: "PATCH", body: JSON.stringify({ notes: notes ?? data.review.notes, completed: done }) });
      await reload();
      setFeedback(done ? "Revisione completata per questa settimana." : "Note salvate.");
    } catch (reason) { setFeedback(errorMessage(reason)); }
    finally { setSaving(null); }
  };
  const list = (title: string, items: Item[], description: string) => <section className="review-card"><div><h2>{title}</h2><p>{description}</p></div>{items.length ? <div className="review-items">{items.map((item) => <Link key={item.id} href={getItemHref(item as never)}><span>{item.itemKey}</span>{item.title}</Link>)}</div> : <p className="detail-empty">Tutto in ordine.</p>}</section>;
  const completedLabel = data.review.completedAt ? new Intl.DateTimeFormat("it-IT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(data.review.completedAt)) : null;
  return <div className="page weekly-review-page"><header className="notification-header"><div><p className="eyebrow">Metti in ordine la settimana</p><h1>Revisione settimanale</h1><p>Un momento per chiudere il passato e definire il prossimo passo.</p></div><div className="review-stats"><strong>{data.completed}</strong><span>completate</span><strong>{data.inbox}</strong><span>da organizzare</span></div></header><div className="review-grid">{list("Attività scadute", data.overdue, "Rimetti in movimento ciò che è rimasto indietro.")}{list("In scadenza", data.upcoming, "Proteggi il tempo per le prossime priorità.")}{list("Progetti da riprendere", data.inactive, "Progetti attivi senza un aggiornamento recente.")}</div><section className="review-card review-notes"><div><h2>Decisioni della settimana</h2><p>Annota le priorità e i passi concreti che vuoi portare avanti.</p></div><textarea rows={7} value={notes ?? ""} onChange={(event) => setNotes(event.target.value)} placeholder="Scrivi le priorità e le decisioni…" />{feedback && <p className={`review-feedback ${feedback.includes("salvate") || feedback.includes("completata") ? "is-success" : ""}`} role="status">{feedback.includes("salvate") || feedback.includes("completata") ? <CheckCircle size={15} /> : null}{feedback}</p>}{completedLabel && <p className="review-completed"><CheckCircle2 size={14} /> Completata il {completedLabel}</p>}<div className="dialog-footer"><button className="button button-secondary" disabled={saving !== null} onClick={() => void save(false)}><Save size={15} /> {saving === "notes" ? "Salvataggio…" : "Salva note"}</button><button className="button button-primary" disabled={saving !== null} onClick={() => void save(true)}><CheckCircle2 size={15} /> {saving === "complete" ? "Completamento…" : data.review.completedAt ? "Aggiorna revisione" : "Completa revisione"}</button></div></section></div>;
}

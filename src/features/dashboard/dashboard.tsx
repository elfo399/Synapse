"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, CheckSquare, Circle, FileText, Folder, Inbox, LoaderCircle, Network, Plus } from "lucide-react";
import type { DashboardData } from "@/domain/types";
import { EmptyState, ErrorState, ItemRow, Loading, PageHeader } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "@/features/items/api";
import { useRemote } from "@/features/items/use-remote";

export function Dashboard() {
  const { data, loading, error, reload } = useRemote<DashboardData>("/api/dashboard");
  const { notify, capture } = useWorkspace();
  const [thought, setThought] = useState(""); const [saving, setSaving] = useState(false); const [captureError, setCaptureError] = useState("");
  const [pendingTask, setPendingTask] = useState<string | null>(null);
  async function quickCapture(event: React.FormEvent) {
    event.preventDefault(); if (!thought.trim() || saving) return;
    setSaving(true); setCaptureError("");
    try { const lines = thought.trim().split("\n"); await api("/api/items", { method: "POST", body: JSON.stringify({ title: lines[0].slice(0, 200), content: lines[0].length > 200 ? thought.trim() : lines.slice(1).join("\n"), type: "NOTE", inbox: true }) }); setThought(""); changed(); notify("Idea salvata tra gli elementi da organizzare."); }
    catch (error) { setCaptureError(errorMessage(error)); } finally { setSaving(false); }
  }
  async function completeTask(id: string) {
    setPendingTask(id);
    try { await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ status: "DONE" }) }); changed(); notify("Un pensiero in meno. Attività completata."); } catch (error) { notify(errorMessage(error)); } finally { setPendingTask(null); }
  }
  const countCards = [{ key: "inbox", title: "Da organizzare", icon: Inbox, href: "/inbox", note: "Pronti per trovare il loro posto" }, { key: "tasks", title: "Attività aperte", icon: CheckSquare, href: "/tasks", note: "Piccoli passi, progressi concreti" }, { key: "projects", title: "Progetti attivi", icon: Folder, href: "/projects", note: "Idee che prendono forma" }, { key: "notes", title: "Note collegate", icon: FileText, href: "/notes", note: "Le tue conoscenze crescono" }] as const;
  return <div className="page dashboard-page"><PageHeader eyebrow="IL TUO SPAZIO PERSONALE" title="Una mente più libera parte da qui." description="Annota un pensiero. Collega un’idea. Realizza qualcosa." actions={<span className="today-label">{new Intl.DateTimeFormat("it-IT", { timeZone: "Europe/Rome", weekday: "long", month: "short", day: "numeric" }).format(new Date())}</span>} />
    <div className="stat-grid">{countCards.map(card => <Link className="stat-card" href={card.href} key={card.key}><div className="stat-label"><span>{card.title}</span><card.icon size={17} /></div><strong>{data ? data.counts[card.key] : "—"}</strong><span className="stat-note">{card.note}<ArrowRight size={13} /></span></Link>)}</div>
    <section className="quick-capture-panel"><div className="quick-capture-heading"><span className="capture-symbol"><Plus size={20} /></span><div><h2>Libera spazio nella mente.</h2><p>Annota i tuoi pensieri. Li organizzerai dopo.</p></div><span className="subtle-label">ANNOTAZIONE RAPIDA</span></div><form onSubmit={quickCapture}><label htmlFor="quick-capture" className="sr-only">Annotazione rapida</label><textarea id="quick-capture" placeholder="Un’idea, un promemoria, qualcosa da ricordare…" rows={2} value={thought} onChange={event => setThought(event.target.value)} onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="quick-capture-footer"><span><kbd>⌘</kbd> + <kbd>↵</kbd> per annotare <span className="capture-footer-separator">·</span> Organizza dopo.</span><button className="button button-primary" type="submit" disabled={saving || !thought.trim()}>{saving ? <LoaderCircle size={15} className="spin" /> : <ArrowUp size={15} />}Salva il pensiero</button></div>{captureError && <p role="alert" className="form-error">{captureError}</p>}</form></section>
    {error ? <ErrorState message={error} retry={reload} /> : loading && !data ? <Loading /> : data && <>
      <div className="dashboard-columns"><section className="panel"><div className="panel-heading"><h2><CheckSquare size={17} />Le priorità di oggi<span className="count-badge">{data.todayTasks.length}</span></h2><Link href="/tasks" className="text-link">Tutte le attività<ArrowRight size={14} /></Link></div><div className="task-list">{data.todayTasks.length ? data.todayTasks.map(task => <div className="task-row" key={task.id}><button className="task-check" aria-label={`Completa ${task.title}`} disabled={pendingTask === task.id} onClick={() => completeTask(task.id)}>{pendingTask === task.id ? <LoaderCircle className="spin" size={18} /> : <><Circle size={19} className="unchecked" /><Check size={16} className="checked" /></>}</button><Link href={`/items/${task.id}`}><strong>{task.title}</strong><span>{task.tags.map(tag => tag.name).join(" · ") || "Un piccolo passo avanti"}</span></Link>{task.dueAt && <span className="due-label">{new Date(task.dueAt) < new Date(new Date().setHours(0, 0, 0, 0)) ? "In ritardo" : "Oggi"}</span>}</div>) : <EmptyState title="Un po’ di respiro." description="Nessuna attività in scadenza oggi. Scegli il tuo prossimo passo." action={<button className="text-link" onClick={() => capture("TASK", false)}>Aggiungi un’attività<Plus size={14} /></button>} />}</div></section>
      <section className="panel"><div className="panel-heading"><h2><Folder size={17} />Progetti attivi</h2><Link href="/projects" className="text-link">Vedi tutti<ArrowRight size={14} /></Link></div><div className="project-list">{data.activeProjects.length ? data.activeProjects.slice(0, 4).map(project => <Link className="project-card" href={`/items/${project.id}`} key={project.id}><span className="project-folder"><Folder size={20} /></span><div><strong>{project.title}</strong><span>{project.content.replace(/[#*`]/g, "").slice(0, 75) || "Fai fare un passo avanti a questo progetto."}</span></div><ArrowRight size={15} /></Link>) : <EmptyState title="Che cosa vuoi realizzare?" description="Dai uno spazio al tuo prossimo obiettivo." action={<button className="text-link" onClick={() => capture("PROJECT", false)}>Crea un progetto<Plus size={14} /></button>} />}</div></section></div>
      <section className="panel recent-panel"><div className="panel-heading"><h2>I tuoi pensieri recenti</h2><span className="subtle-label">LE TUE ULTIME MODIFICHE</span></div>{data.recentItems.length ? data.recentItems.slice(0, 6).map(item => <ItemRow key={item.id} item={item} />) : <EmptyState title="Synapse inizia con un pensiero." description="Annota la tua prima idea qui sopra. Potrai organizzarla quando vorrai." />}</section>
      <Link className="graph-callout" href="/graph"><span className="graph-callout-icon"><Network size={26} /></span><div><h3>Le buone idee crescono insieme.</h3><p>Esplora i collegamenti nel tuo grafo delle conoscenze.</p></div><ArrowRight size={21} /></Link>
    </>}
  </div>;
}

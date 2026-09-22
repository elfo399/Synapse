"use client";

import { getItemHref } from "@/domain/item-url";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  Folder,
  Inbox,
  LoaderCircle,
  Network,
  Plus,
} from "lucide-react";
import type { DashboardData, PlannerData } from "@/domain/types";
import { EmptyState, ErrorState, Loading, TypeIcon } from "@/components/ui";
import { useWorkspace } from "@/components/workspace-context";
import { api, changed, errorMessage } from "@/features/items/api";
import { dateLabel } from "@/features/items/types";
import { useRemote } from "@/features/items/use-remote";
import { UniversalCaptureForm } from "@/features/items/capture-dialog";
import "./dashboard.css";

const subscribeToDate = (notify: () => void) => {
  const timer = window.setInterval(notify, 60_000);
  return () => window.clearInterval(timer);
};
const today = () =>
  new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());
const plannerRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return `/api/planner?from=${encodeURIComponent(start.toISOString())}&to=${encodeURIComponent(end.toISOString())}`;
};
const nowMillis = () => Date.now();
function TodayPlan() {
  const { data } = useRemote<PlannerData>(plannerRange());
  const now = useSyncExternalStore(subscribeToDate, nowMillis, () => 0);
  const current = data?.blocks.find(
    (block) =>
      new Date(block.startsAt).getTime() <= now &&
      new Date(block.endsAt).getTime() > now,
  );
  const next = data?.blocks.find(
    (block) => new Date(block.startsAt).getTime() > now,
  );
  return (
    <section
      className="home-section home-planner"
      aria-labelledby="home-planner-heading"
    >
      <div className="home-section-heading">
        <h2 id="home-planner-heading">
          <CalendarDays size={16} />
          Il tuo piano
        </h2>
        <Link href="/planner" className="text-link">
          Apri planner
          <ArrowRight size={13} />
        </Link>
      </div>
      {current || next ? (
        <div className="home-planner-preview">
          {current && (
            <div>
              <span>Adesso</span>
              <strong>{current.title}</strong>
              <small>
                Fino alle{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(current.endsAt))}
              </small>
            </div>
          )}
          {next && (
            <div>
              <span>Prossimo</span>
              <strong>{next.title}</strong>
              <small>
                Alle{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(next.startsAt))}
              </small>
            </div>
          )}
        </div>
      ) : (
        <div className="home-quiet-empty">
          <p>La giornata è libera.</p>
          <Link href="/planner" className="text-link">
            <Plus size={14} />
            Aggiungi un blocco
          </Link>
        </div>
      )}
    </section>
  );
}

export function Dashboard() {
  const { data, loading, error, reload } =
    useRemote<DashboardData>("/api/dashboard");
  const { notify, capture, name } = useWorkspace();
  const date = useSyncExternalStore(subscribeToDate, today, () => "");
  const [pendingTask, setPendingTask] = useState<string | null>(null);

  async function completeTask(id: string) {
    setPendingTask(id);
    try {
      await api(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "DONE" }),
      });
      changed();
      notify("Attività completata.");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setPendingTask(null);
    }
  }

  return (
    <div className="page thinking-home">
      <header className="home-heading">
        <div>
          <p className="home-date">{date || "Il tuo spazio personale"}</p>
          <h1>Ciao{name.trim() ? `, ${name.trim().split(/\s+/)[0]}` : ""}.</h1>
        </div>
        {!!data?.counts.inbox && (
          <Link href="/inbox" className="home-inbox-link">
            <Inbox size={15} />
            <span>{data.counts.inbox} da organizzare</span>
            <ArrowRight size={14} />
          </Link>
        )}
      </header>
      <section className="thought-composer" aria-labelledby="thought-heading">
        <h2 id="thought-heading">Cosa vuoi ricordare?</h2>
        <UniversalCaptureForm embedded />
      </section>
      {error ? (
        <ErrorState message={error} retry={reload} />
      ) : loading && !data ? (
        <Loading label="Caricamento dei tuoi pensieri…" />
      ) : (
        data && (
          <>
            <div className="home-reading-columns">
              <section
                className="home-section"
                aria-labelledby="home-today-heading"
              >
                <div className="home-section-heading">
                  <h2 id="home-today-heading">Oggi</h2>
                  <Link href="/tasks" className="text-link">
                    Tutte le attività
                    <ArrowRight size={13} />
                  </Link>
                </div>
                {data.todayTasks.length ? (
                  <div className="home-task-list">
                    {data.todayTasks.slice(0, 5).map((task) => (
                      <div className="home-task" key={task.id}>
                        <button
                          className="home-task-check"
                          aria-label={`Completa ${task.title}`}
                          disabled={pendingTask === task.id}
                          onClick={() => completeTask(task.id)}
                        >
                          {pendingTask === task.id ? (
                            <LoaderCircle className="spin" size={18} />
                          ) : (
                            <>
                              <Circle size={19} className="unchecked" />
                              <Check size={16} className="checked" />
                            </>
                          )}
                        </button>
                        <Link href={getItemHref(task)}>
                          <span>{task.title}</span>
                          {task.dueAt && (
                            <small>Scadenza {dateLabel(task.dueAt)}</small>
                          )}
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="home-quiet-empty">
                    <p>Nessuna attività in programma.</p>
                    <button
                      className="text-link"
                      onClick={() => capture("TASK", false)}
                    >
                      <Plus size={14} />
                      Aggiungi un’attività
                    </button>
                  </div>
                )}
              </section>
              <section
                className="home-section"
                aria-labelledby="home-recent-heading"
              >
                <div className="home-section-heading">
                  <h2 id="home-recent-heading">Riprendi da qui</h2>
                  <span>Modificati di recente</span>
                </div>
                {data.recentItems.length ? (
                  <div className="home-recent-list">
                    {data.recentItems.slice(0, 5).map((item) => (
                      <Link
                        href={getItemHref(item)}
                        className="home-recent-item"
                        key={item.id}
                      >
                        <TypeIcon type={item.type} size={16} />
                        <span>{item.title}</span>
                        <time dateTime={item.updatedAt}>
                          {dateLabel(item.updatedAt)}
                        </time>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="home-quiet-empty">
                    Le tue note recenti compariranno qui.
                  </p>
                )}
              </section>
            </div>
            <section
              className="home-section home-projects"
              aria-labelledby="home-projects-heading"
            >
              <div className="home-section-heading">
                <h2 id="home-projects-heading">Progetti attivi</h2>
                <Link href="/projects" className="text-link">
                  Vedi tutti
                  <ArrowRight size={13} />
                </Link>
              </div>
              {data.activeProjects.length ? (
                <div>
                  {data.activeProjects.slice(0, 4).map((project) => (
                    <Link
                      className="home-project"
                      href={getItemHref(project)}
                      key={project.id}
                    >
                      <Folder size={18} />
                      <div>
                        <strong>{project.title}</strong>
                        <p>
                          {project.content
                            .replace(/[#*`\[\]]/g, "")
                            .slice(0, 120) ||
                            "Note, attività e risorse di questo progetto."}
                        </p>
                      </div>
                      <span className="home-project-context">
                        {(project._count?.outgoing ?? 0) +
                          (project._count?.incoming ?? 0)}{" "}
                        collegamenti
                      </span>
                      <ArrowRight size={15} />
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Nessun progetto attivo"
                  description="Raccogli note e attività intorno a un obiettivo."
                  action={
                    <button
                      className="text-link"
                      onClick={() => capture("PROJECT", false)}
                    >
                      <Plus size={14} />
                      Crea un progetto
                    </button>
                  }
                />
              )}
            </section>
            <TodayPlan />
            <footer className="home-knowledge">
              <div>
                <Network size={18} />
                <span>
                  {data.counts.notes}{" "}
                  {data.counts.notes === 1 ? "nota" : "note"} nel tuo spazio
                </span>
              </div>
              <Link href="/graph" className="text-link">
                Esplora i collegamenti
                <ArrowRight size={14} />
              </Link>
            </footer>
          </>
        )
      )}
    </div>
  );
}

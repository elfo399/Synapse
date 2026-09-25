"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CircleDot,
  ClipboardList,
  FolderKanban,
  Layers3,
  ListTodo,
  Plus,
} from "lucide-react";
import { Modal, TypeIcon } from "@/components/ui";
import { getItemHref } from "@/domain/item-url";
import type { ItemDetail, RelationItem } from "@/domain/types";
import { dateLabel, statusLabels } from "./types";
import { UniversalCaptureForm } from "./capture-dialog";

type CreateType = "PROJECT" | "RESOURCE" | "TASK";

function ContextualCreate({
  item,
  type,
  onClose,
  onReload,
}: {
  item: ItemDetail;
  type: CreateType | null;
  onClose: () => void;
  onReload: () => void;
}) {
  const labels: Record<CreateType, string> = {
    PROJECT: "Nuovo progetto",
    RESOURCE: "Nuova risorsa",
    TASK: "Nuova attività",
  };
  return (
    <Modal
      open={Boolean(type)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={type ? labels[type] : "Nuovo elemento"}
      description={`L’elemento verrà organizzato in ${item.title}.`}
      className="capture-dialog"
    >
      {type && (
        <UniversalCaptureForm
          initialType={type}
          inbox={false}
          parentIds={[item.id]}
          onSaved={() => {
            onClose();
            onReload();
          }}
        />
      )}
    </Modal>
  );
}

function WorkspaceItem({ item, meta }: { item: RelationItem; meta?: string }) {
  return (
    <Link className="role-workspace-item" href={getItemHref(item)}>
      <TypeIcon type={item.type} size={16} />
      <span>
        <strong>{item.title}</strong>
        {meta && <small>{meta}</small>}
      </span>
      <span className="role-workspace-arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

function WorkspaceSection({
  icon,
  title,
  count,
  action,
  children,
  empty,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  empty: string;
  className?: string;
}) {
  return (
    <section className={`role-workspace-section ${className}`}>
      <header>
        <h3>
          {icon}
          {title}
          <span>{count}</span>
        </h3>
        {action}
      </header>
      {count ? (
        <div className="role-workspace-list">{children}</div>
      ) : (
        <p>{empty}</p>
      )}
    </section>
  );
}

export function AreaWorkspace({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const [createType, setCreateType] = useState<CreateType | null>(null);
  if (item.type !== "AREA") return null;
  const children = item.incoming.filter(
    (relation) => relation.relationType === "PARENT",
  );
  const projects = children.filter(
    (relation) => relation.source.type === "PROJECT",
  );
  const resources = children.filter(
    (relation) => relation.source.type === "RESOURCE",
  );
  const tasks = children.filter((relation) => relation.source.type === "TASK");
  const activeTasks = tasks.filter(
    (relation) => relation.source.status !== "DONE",
  ).length;
  const create = (type: CreateType, label: string) => (
    <button className="text-link" onClick={() => setCreateType(type)}>
      <Plus size={14} />
      {label}
    </button>
  );
  return (
    <section
      className="role-workspace area-workspace"
      aria-labelledby="area-workspace-heading"
    >
      <header className="role-workspace-hero">
        <div className="role-workspace-hero-icon">
          <Layers3 size={24} />
        </div>
        <div>
          <span className="role-workspace-eyebrow">Area di responsabilità</span>
          <h2 id="area-workspace-heading">
            Tutto ciò che riguarda {item.title}
          </h2>
          <p>
            Progetti, materiali e attività che vuoi mantenere ordinati nel
            tempo.
          </p>
        </div>
        <div className="area-workspace-summary" aria-label="Riepilogo area">
          <span>
            <strong>{projects.length}</strong> progetti
          </span>
          <span>
            <strong>{activeTasks}</strong> prossimi passi
          </span>
        </div>
      </header>
      <div className="area-workspace-grid">
        <WorkspaceSection
          icon={<FolderKanban size={17} />}
          title="Progetti"
          count={projects.length}
          action={create("PROJECT", "Nuovo progetto")}
          empty="Crea un progetto quando un obiettivo merita uno spazio dedicato."
          className="area-workspace-projects"
        >
          {projects.map((relation) => (
            <WorkspaceItem
              key={relation.id}
              item={relation.source}
              meta={statusLabels[relation.source.status || "ACTIVE"]}
            />
          ))}
        </WorkspaceSection>
        <WorkspaceSection
          icon={<ClipboardList size={17} />}
          title="Risorse generali"
          count={resources.length}
          action={create("RESOURCE", "Nuova risorsa")}
          empty="Conserva qui una raccolta che non appartiene a un singolo progetto."
        >
          {resources.map((relation) => (
            <WorkspaceItem key={relation.id} item={relation.source} />
          ))}
        </WorkspaceSection>
        <WorkspaceSection
          icon={<ListTodo size={17} />}
          title="Attività dell’area"
          count={tasks.length}
          action={create("TASK", "Nuova attività")}
          empty="Le attività indipendenti dai progetti compariranno qui."
          className="area-workspace-tasks"
        >
          {tasks.map((relation) => (
            <WorkspaceItem
              key={relation.id}
              item={relation.source}
              meta={`${statusLabels[relation.source.status || "TODO"]}${relation.source.dueAt ? ` · ${dateLabel(relation.source.dueAt)}` : ""}`}
            />
          ))}
        </WorkspaceSection>
      </div>
      <ContextualCreate
        item={item}
        type={createType}
        onClose={() => setCreateType(null)}
        onReload={onReload}
      />
    </section>
  );
}

export function ProjectWorkspace({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const [createType, setCreateType] = useState<CreateType | null>(null);
  if (item.type !== "PROJECT") return null;
  const children = item.incoming.filter(
    (relation) => relation.relationType === "PARENT",
  );
  const tasks = children.filter((relation) => relation.source.type === "TASK");
  const resources = children.filter(
    (relation) => relation.source.type === "RESOURCE",
  );
  const grouped = {
    TODO: tasks.filter((relation) => relation.source.status === "TODO"),
    IN_PROGRESS: tasks.filter(
      (relation) => relation.source.status === "IN_PROGRESS",
    ),
    DONE: tasks.filter((relation) => relation.source.status === "DONE"),
  };
  const progress = tasks.length
    ? Math.round((grouped.DONE.length / tasks.length) * 100)
    : 0;
  const datedTasks = tasks
    .filter((relation) => relation.source.dueAt)
    .sort((a, b) => (a.source.dueAt || "").localeCompare(b.source.dueAt || ""));
  return (
    <section
      className="role-workspace project-workspace"
      aria-labelledby="project-workspace-heading"
    >
      <header className="project-workspace-hero">
        <div>
          <span className="role-workspace-eyebrow">Dashboard del progetto</span>
          <h2 id="project-workspace-heading">Avanzamento e prossimi passi</h2>
          <div className="project-workspace-state">
            <CircleDot size={14} />
            {statusLabels[item.status]}
          </div>
        </div>
        <div
          className="project-progress"
          style={{ "--progress": `${progress}%` } as React.CSSProperties}
          aria-label={`${progress}% completato`}
        >
          <strong>{progress}%</strong>
          <span>completato</span>
        </div>
        <div className="project-workspace-actions">
          <button
            className="button button-primary compact"
            onClick={() => setCreateType("TASK")}
          >
            <Plus size={15} />
            Nuova attività
          </button>
          <button
            className="button button-secondary compact"
            onClick={() => setCreateType("RESOURCE")}
          >
            <Plus size={15} />
            Nuova risorsa
          </button>
        </div>
      </header>
      <div className="project-workspace-body">
        <section className="project-task-board" aria-label="Attività per stato">
          {(["TODO", "IN_PROGRESS", "DONE"] as const).map((status) => (
            <section
              key={status}
              className={`project-task-column status-${status.toLowerCase()}`}
            >
              <h3>
                {status === "TODO"
                  ? "Da fare"
                  : status === "IN_PROGRESS"
                    ? "In corso"
                    : "Completate"}
                <span>{grouped[status].length}</span>
              </h3>
              <div>
                {grouped[status].length ? (
                  grouped[status].map((relation) => (
                    <WorkspaceItem
                      key={relation.id}
                      item={relation.source}
                      meta={
                        relation.source.dueAt
                          ? `Entro ${dateLabel(relation.source.dueAt)}`
                          : undefined
                      }
                    />
                  ))
                ) : (
                  <p>Nessuna attività.</p>
                )}
              </div>
            </section>
          ))}
        </section>
        <aside className="project-workspace-sidebar">
          <WorkspaceSection
            icon={<CalendarDays size={16} />}
            title="Scadenze"
            count={datedTasks.length + (item.dueAt ? 1 : 0)}
            empty="Nessuna scadenza fissata."
          >
            {item.dueAt && (
              <div className="project-deadline">
                <CalendarDays size={14} />
                <span>
                  <strong>Scadenza del progetto</strong>
                  <small>{dateLabel(item.dueAt)}</small>
                </span>
              </div>
            )}
            {datedTasks.map((relation) => (
              <div className="project-deadline" key={relation.id}>
                <ListTodo size={14} />
                <span>
                  <strong>{relation.source.title}</strong>
                  <small>{dateLabel(relation.source.dueAt!)}</small>
                </span>
              </div>
            ))}
          </WorkspaceSection>
          <WorkspaceSection
            icon={<FolderKanban size={16} />}
            title="Risorse"
            count={resources.length}
            action={
              <button
                className="text-link"
                onClick={() => setCreateType("RESOURCE")}
              >
                <Plus size={13} />
                Aggiungi
              </button>
            }
            empty="Aggiungi riferimenti e materiali utili al progetto."
          >
            {resources.map((relation) => (
              <WorkspaceItem key={relation.id} item={relation.source} />
            ))}
          </WorkspaceSection>
        </aside>
      </div>
      <ContextualCreate
        item={item}
        type={createType}
        onClose={() => setCreateType(null)}
        onReload={onReload}
      />
    </section>
  );
}

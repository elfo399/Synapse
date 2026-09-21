"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, ListTodo, Plus } from "lucide-react";
import { Modal } from "@/components/ui";
import { getItemHref } from "@/domain/item-url";
import type { ItemDetail, RelationItem } from "@/domain/types";
import { api, changed, errorMessage } from "./api";
import { dateLabel, statusLabels } from "./types";
import { UniversalCaptureForm } from "./capture-dialog";

export function relatedTasks(item: ItemDetail) {
  return [
    ...new Map(
      [
        ...item.outgoing.map((relation) => relation.target),
        ...item.incoming.map((relation) => relation.source),
      ]
        .filter((value) => value.type === "TASK")
        .map((value) => [value.id, value]),
    ).values(),
  ];
}

export function RelatedTasks({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const tasks = relatedTasks(item);
  const canCreate = ["PROJECT", "AREA", "RESOURCE"].includes(item.type);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function toggle(task: RelationItem) {
    setBusy(true);
    setError("");
    try {
      await api(`/api/items/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: task.status === "DONE" ? "TODO" : "DONE",
        }),
      });
      changed();
      onReload();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  if (!tasks.length && !canCreate) return null;
  return (
    <section
      className="detail-card"
      id="attivita"
      aria-labelledby="related-tasks-heading"
    >
      <div className="detail-card-heading">
        <h2 id="related-tasks-heading">
          <ListTodo size={17} />
          Attività collegate <span>{tasks.length}</span>
        </h2>
        {canCreate && (
          <button className="text-link" onClick={() => setOpen(true)}>
            <Plus size={14} />
            Nuova attività
          </button>
        )}
      </div>
      {!tasks.length && (
        <p className="detail-empty">
          Trasforma un’idea in un prossimo passo. Le attività di questa raccolta
          compariranno qui.
        </p>
      )}
      {tasks.map((task) => (
        <div className="detail-task" key={task.id}>
          <button
            className={`icon-button ${task.status === "DONE" ? "is-complete" : ""}`}
            disabled={busy || Boolean(task.archivedAt)}
            aria-label={`${task.status === "DONE" ? "Riapri" : "Completa"} ${task.title}`}
            onClick={() => toggle(task)}
          >
            {task.status === "DONE" ? (
              <Check size={17} />
            ) : (
              <Circle size={17} />
            )}
          </button>
          <Link href={getItemHref(task)}>{task.title}</Link>
          <span>
            {task.archivedAt
              ? "Archiviata"
              : statusLabels[task.status || "TODO"]}
          </span>
          {task.dueAt && (
            <time dateTime={task.dueAt}>{dateLabel(task.dueAt)}</time>
          )}
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Modal
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
        title="Nuova attività collegata"
        description={`L’attività verrà organizzata in ${item.title}.`}
        className="capture-dialog"
      >
        <UniversalCaptureForm
          initialType="TASK"
          inbox={false}
          parentIds={[item.id]}
          onBusyChange={setBusy}
          onSaved={() => {
            setOpen(false);
            onReload();
          }}
        />
      </Modal>
    </section>
  );
}

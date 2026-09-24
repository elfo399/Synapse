"use client";

import { useState } from "react";
import { CalendarDays, FolderKanban, Plus, Target } from "lucide-react";
import { Modal } from "@/components/ui";
import type { ItemDetail, ItemType } from "@/domain/types";
import { UniversalCaptureForm } from "./capture-dialog";

const actions: Record<"AREA" | "PROJECT", { type: ItemType; label: string }[]> =
  {
    AREA: [
      { type: "PROJECT", label: "Nuovo progetto" },
      { type: "RESOURCE", label: "Nuova risorsa" },
      { type: "NOTE", label: "Nuova nota" },
    ],
    PROJECT: [
      { type: "TASK", label: "Nuova attività" },
      { type: "RESOURCE", label: "Nuova risorsa" },
      { type: "NOTE", label: "Nuova nota" },
    ],
  };

export function CollectionOverview({
  item,
  onReload,
}: {
  item: ItemDetail;
  onReload: () => void;
}) {
  const [createType, setCreateType] = useState<ItemType | null>(null);
  if (item.type !== "AREA" && item.type !== "PROJECT") return null;
  const contained = item.incoming.filter(
    (relation) => relation.relationType === "PARENT",
  );
  const tasks = contained.filter((relation) => relation.source.type === "TASK");
  const done = tasks.filter(
    (relation) => relation.source.status === "DONE",
  ).length;
  const resources = contained.filter(
    (relation) => relation.source.type === "RESOURCE",
  ).length;
  const projects = contained.filter(
    (relation) => relation.source.type === "PROJECT",
  ).length;
  const isProject = item.type === "PROJECT";
  return (
    <section
      className="collection-overview detail-card"
      aria-label={`Panoramica ${isProject ? "del progetto" : "dell’area"}`}
    >
      <div className="collection-overview-main">
        <span className="collection-overview-icon">
          {isProject ? <Target size={19} /> : <FolderKanban size={19} />}
        </span>
        <div>
          <p className="collection-overview-kicker">
            {isProject ? "Obiettivo" : "Area di responsabilità"}
          </p>
          <p>
            {isProject
              ? "Riunisci qui il materiale e le azioni che portano al risultato."
              : "Uno spazio stabile per i progetti e le conoscenze che appartengono allo stesso ambito."}
          </p>
        </div>
      </div>
      <div className="collection-overview-stats">
        {isProject ? (
          <>
            <span>
              <strong>
                {done}/{tasks.length}
              </strong>{" "}
              attività completate
            </span>
            <span>
              <strong>{resources}</strong> risorse
            </span>
            {item.dueAt && (
              <span>
                <CalendarDays size={13} /> Scadenza{" "}
                {new Intl.DateTimeFormat("it-IT", {
                  day: "numeric",
                  month: "short",
                }).format(new Date(item.dueAt))}
              </span>
            )}
          </>
        ) : (
          <>
            <span>
              <strong>{projects}</strong> progetti
            </span>
            <span>
              <strong>{resources}</strong> risorse indipendenti
            </span>
            <span>
              <strong>{tasks.length}</strong> attività
            </span>
          </>
        )}
      </div>
      <div className="collection-overview-actions">
        {actions[item.type].map((action) => (
          <button
            key={action.type}
            className="text-link"
            onClick={() => setCreateType(action.type)}
          >
            <Plus size={14} />
            {action.label}
          </button>
        ))}
      </div>
      <Modal
        open={Boolean(createType)}
        onOpenChange={(open) => {
          if (!open) setCreateType(null);
        }}
        title={
          createType
            ? (actions[item.type].find((entry) => entry.type === createType)
                ?.label ?? "Nuovo elemento")
            : "Nuovo elemento"
        }
        description={`L’elemento verrà organizzato in ${item.title}.`}
        className="capture-dialog"
      >
        {createType && (
          <UniversalCaptureForm
            initialType={createType}
            inbox={false}
            parentIds={[item.id]}
            onSaved={() => {
              setCreateType(null);
              onReload();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

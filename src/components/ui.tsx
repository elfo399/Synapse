"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowUpRight, Bookmark, Box, CheckSquare, FileText, Folder, Inbox, Layers3, LoaderCircle, X } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { ItemSummary, ItemType } from "@/features/items/types";
import { dateLabel, typeLabels } from "@/features/items/types";

export function TypeIcon({ type, size = 17 }: { type: ItemType; size?: number }) {
  const Icon = { NOTE: FileText, TASK: CheckSquare, PROJECT: Folder, AREA: Layers3, RESOURCE: Box, BOOKMARK: Bookmark }[type];
  return <Icon size={size} aria-hidden="true" />;
}
export function TypeBadge({ type }: { type: ItemType }) {
  return <span className={`type-badge type-${type.toLowerCase()}`}><TypeIcon type={type} size={13} />{typeLabels[type]}</span>;
}
export function Modal({ open, onOpenChange, title, description, children, wide = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; children: ReactNode; wide?: boolean;
}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className={`dialog-content ${wide ? "dialog-wide" : ""}`}>
      <div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description}</Dialog.Description></div>
        <Dialog.Close className="icon-button" aria-label="Chiudi la finestra"><X size={19} /></Dialog.Close></div>{children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function Loading({ label = "Caricamento dello spazio personale…" }: { label?: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={22} /><span>{label}</span></div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="error-state" role="alert"><p>{message}</p>{retry && <button className="button button-secondary" onClick={retry}>Riprova</button>}</div>;
}
export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Inbox size={25} /></span><h3>{title}</h3><p>{description}</p>{action}</div>;
}
export function ItemRow({ item, action }: { item: ItemSummary; action?: ReactNode }) {
  return <div className="item-row">
    <span className={`item-icon type-${item.type.toLowerCase()}`}><TypeIcon type={item.type} /></span>
    <Link href={`/items/${item.id}`} className="item-row-main"><span className="item-row-title">{item.title}</span>
      <span className="item-row-meta">{item.snippet || item.content?.replace(/[#*`\[\]]/g, "").slice(0, 100) || typeLabels[item.type]}</span></Link>
    <div className="item-row-tags">{item.tags.slice(0, 2).map(tag => <Link className="tag" key={tag.id} href={`/tags?tag=${encodeURIComponent(tag.name)}`}>{tag.name}</Link>)}</div>
    {item.archivedAt && <span className="subtle-label">Archiviato</span>}
    <span className="item-row-date">{dateLabel(item.updatedAt)}</span>{action || <ArrowUpRight size={15} className="muted" aria-hidden="true" />}
  </div>;
}
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div>{actions && <div className="page-header-actions">{actions}</div>}</header>;
}

"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Palette, Trash2 } from "lucide-react";
import type { PlannerCategorySummary } from "@/domain/types";
import { CategoryManager } from "@/features/planner/planner";
import { useRemote } from "@/features/items/use-remote";
import { api, changed, errorMessage } from "@/features/items/api";
import "./settings.css";

type CategoriesResponse = { categories: PlannerCategorySummary[] };
type SettingsResponse = { settings: { trashRetentionDays: number }; expiredOperations: number };
const retention = [7, 14, 30, 60, 90];
export function SettingsPage() {
  const { data, loading, error, reload } = useRemote<CategoriesResponse>("/api/planner/categories");
  const { data: settings, reload: reloadSettings } = useRemote<SettingsResponse>("/api/settings");
  const [categoriesOpen, setCategoriesOpen] = useState(false); const [nextDays, setNextDays] = useState<number | null>(null); const [saving, setSaving] = useState(false); const [message, setMessage] = useState("");
  useEffect(() => { if (settings && nextDays === null) setNextDays(settings.settings.trashRetentionDays); }, [settings, nextDays]);
  async function saveRetention(confirm = false) { if (!nextDays) return; setSaving(true); setMessage(""); try { await api("/api/settings", { method: "PATCH", body: JSON.stringify({ trashRetentionDays: nextDays, confirmed: confirm }) }); setMessage("Conservazione del Cestino aggiornata."); await reloadSettings(); } catch (reason) { const status = reason as { status?: number }; if (status.status === 409) { setMessage("Alcuni gruppi nel Cestino risultano già scaduti con questo periodo. Conferma per applicare la modifica: saranno rimossi al prossimo ciclo giornaliero."); } else setMessage(errorMessage(reason)); } finally { setSaving(false); } }
  return <div className="page settings-page"><header className="settings-header"><div><p className="eyebrow">Il tuo spazio, le tue regole</p><h1>Configurazione</h1><p>Personalizza le categorie e le regole di conservazione di Synapse.</p></div></header>
    <section className="settings-section" id="categorie" aria-labelledby="categorie-heading"><div className="settings-section-heading"><div className="settings-icon"><Palette size={19} /></div><div><h2 id="categorie-heading">Categorie</h2><p>Crea e organizza i gruppi che usi per classificare le tue cose.</p></div></div><button className="settings-card" onClick={() => setCategoriesOpen(true)}><span className="settings-card-icon"><Palette size={18} /></span><span><strong>Categorie</strong><small>{loading ? "Caricamento…" : error ? "Impossibile caricare le categorie" : `${data?.categories.length ?? 0} categorie disponibili`}</small></span><ChevronRight size={18} /></button></section>
    <section className="settings-section" aria-labelledby="trash-heading"><div className="settings-section-heading"><div className="settings-icon"><Trash2 size={19} /></div><div><h2 id="trash-heading">Conservazione del Cestino</h2><p>Gli elementi presenti nel Cestino vengono eliminati definitivamente dopo il periodo selezionato.</p></div></div><div className="settings-card settings-retention"><label>Periodo di conservazione<select value={nextDays ?? 30} onChange={(event) => setNextDays(Number(event.target.value))}>{retention.map((days) => <option key={days} value={days}>{days} giorni</option>)}</select></label><button className="button button-primary" disabled={saving || nextDays === settings?.settings.trashRetentionDays} onClick={() => void saveRetention()}>{saving ? "Salvataggio…" : "Salva"}</button></div>{message && <div className="settings-notice" role="status"><p>{message}</p>{message.includes("Conferma") && <button className="button button-danger compact" disabled={saving} onClick={() => void saveRetention(true)}>Conferma modifica</button>}</div>}</section>
    {categoriesOpen && data && <CategoryManager categories={data.categories} onClose={() => setCategoriesOpen(false)} onChanged={() => { changed(); reload(); }} />}
  </div>;
}

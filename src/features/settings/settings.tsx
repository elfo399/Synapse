"use client";

import { useState } from "react";
import { ChevronRight, Palette } from "lucide-react";
import type { PlannerCategorySummary } from "@/domain/types";
import { CategoryManager } from "@/features/planner/planner";
import { useRemote } from "@/features/items/use-remote";
import { changed } from "@/features/items/api";
import "./settings.css";

type CategoriesResponse = { categories: PlannerCategorySummary[] };

export function SettingsPage() {
  const { data, loading, error, reload } = useRemote<CategoriesResponse>("/api/planner/categories");
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  return <div className="page settings-page">
    <header className="settings-header"><div><p className="eyebrow">Il tuo spazio, le tue regole</p><h1>Configurazione</h1><p>Personalizza le categorie che usi in Synapse.</p></div></header>
    <section className="settings-section" id="categorie" aria-labelledby="categorie-heading">
      <div className="settings-section-heading"><div className="settings-icon"><Palette size={19} /></div><div><h2 id="categorie-heading">Categorie</h2><p>Crea e organizza i gruppi che usi per classificare le tue cose.</p></div></div>
      <button className="settings-card" onClick={() => setCategoriesOpen(true)}>
        <span className="settings-card-icon"><Palette size={18} /></span><span><strong>Categorie</strong><small>{loading ? "Caricamento…" : error ? "Impossibile caricare le categorie" : `${data?.categories.length ?? 0} categorie disponibili`}</small></span><ChevronRight size={18} />
      </button>
    </section>
    {categoriesOpen && data && <CategoryManager categories={data.categories} onClose={() => setCategoriesOpen(false)} onChanged={() => { changed(); reload(); }} />}
  </div>;
}

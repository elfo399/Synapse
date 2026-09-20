"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Archive, ArrowUpRight, Bookmark, Box, BrainCircuit, Check, CheckSquare, Command, FileText, Folder, Hash, House, Inbox, Layers3, LogOut, Menu, Network, Plus, Search, ShieldCheck, X } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { ItemType } from "@/features/items/types";
import { CaptureDialog } from "@/features/items/capture-dialog";
import { SearchDialog } from "./search-dialog";
import { WorkspaceContext } from "./workspace-context";

const navigation = [
  { href: "/", label: "Panoramica", icon: House },
  { href: "/inbox", label: "Da organizzare", icon: Inbox },
  { href: "/notes", label: "Note", icon: FileText },
  { href: "/tasks", label: "Attività", icon: CheckSquare },
  { href: "/projects", label: "Progetti", icon: Folder },
  { href: "/areas", label: "Aree", icon: Layers3 },
  { href: "/resources", label: "Risorse", icon: Box },
  { href: "/bookmarks", label: "Preferiti", icon: Bookmark },
  { href: "/tags", label: "Etichette", icon: Hash },
  { href: "/graph", label: "Grafo delle conoscenze", icon: Network },
  { href: "/archive", label: "Archivio", icon: Archive },
];

export function WorkspaceShell({ children, name, email }: { children: ReactNode; name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [captureState, setCaptureState] = useState<{ type: ItemType; inbox: boolean; key: number } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const capture = useCallback((type: ItemType = "NOTE", inbox = true) => setCaptureState({ type, inbox, key: Date.now() }), []);
  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setSearchOpen(value => !value); }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, []);
  useEffect(() => { if (toast) { const timeout = setTimeout(() => setToast(""), 4500); return () => clearTimeout(timeout); } }, [toast]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  async function signOut() {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      router.push("/login"); router.refresh();
    } catch { notify("Impossibile uscire. Riprova."); setSigningOut(false); }
  }
  return <WorkspaceContext.Provider value={{ capture, search: () => setSearchOpen(true), notify }}>
    <a href="#main-content" className="skip-link">Vai al contenuto</a>
    <div className="workspace">
      {mobileOpen && <button className="sidebar-backdrop" onClick={() => setMobileOpen(false)} aria-label="Chiudi il menu" />}
      <aside className={`sidebar ${mobileOpen ? "is-open" : ""}`} aria-label="Navigazione dello spazio personale">
        <Link href="/" className="brand" onClick={() => setMobileOpen(false)}><span className="brand-mark"><BrainCircuit size={23} /></span><span>Synapse<span className="brand-subtitle">Uno spazio per la tua mente.</span></span></Link>
        <button className="sidebar-search" onClick={() => { setSearchOpen(true); setMobileOpen(false); }}><Search size={16} /><span>Cerca ovunque</span><kbd>⌘ K</kbd></button>
        <div className="nav-section-label">SPAZIO PERSONALE</div>
        <nav>{navigation.map((item, index) => <Link className={`nav-link ${pathname === item.href ? "active" : ""} ${index === 4 || index === 8 ? "nav-break" : ""}`} href={item.href} key={item.href} aria-current={pathname === item.href ? "page" : undefined} onClick={() => setMobileOpen(false)}><item.icon size={18} /><span>{item.label}</span>{pathname === item.href && <span className="nav-dot" />}</Link>)}</nav>
        <div className="sidebar-bottom"><button className="button button-primary sidebar-capture" onClick={() => { capture(); setMobileOpen(false); }}><Plus size={17} />Annotazione rapida<kbd>N</kbd></button><div className="private-indicator"><ShieldCheck size={13} />La tua mente. Il tuo server.</div>
          <div className="account"><span className="avatar">{name.charAt(0).toUpperCase()}</span><div><strong>{name}</strong><span title={email}>Spazio personale</span></div><button className="icon-button" aria-label="Esci" title="Esci" onClick={signOut} disabled={signingOut}><LogOut size={17} /></button></div>
        </div>
      </aside>
      <div className="workspace-body"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Apri il menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><Menu size={21} /></button><span className="breadcrumb">Spazio personale<span>/</span><strong>{navigation.find(item => item.href === pathname)?.label || "Le tue conoscenze"}</strong></span></div><div className="topbar-actions"><span className="workspace-status"><span />Spazio privato</span><button className="icon-button" aria-label="Cerca" onClick={() => setSearchOpen(true)}><Search size={18} /></button><button className="button button-secondary compact" onClick={() => capture()}><Plus size={16} /><span>Annota</span></button></div></header>
        <main id="main-content" className={pathname === "/graph" ? "main-content graph-main" : "main-content"}>{children}</main>
        <footer className="workspace-footer"><span>Fai spazio a ciò che conta.</span><span><Command size={11} /> K per cercare ovunque <ArrowUpRight size={12} /></span></footer>
      </div>
      <nav className="mobile-bottom-nav" aria-label="Navigazione rapida"><Link href="/" aria-label="Panoramica"><House size={20} /><span>Inizio</span></Link><Link href="/inbox"><Inbox size={20} /><span>Da organizzare</span></Link><button className="mobile-capture" onClick={() => capture()} aria-label="Annotazione rapida"><Plus size={25} /></button><button onClick={() => setSearchOpen(true)}><Search size={20} /><span>Cerca</span></button><button onClick={() => setMobileOpen(true)}><Menu size={20} /><span>Altro</span></button></nav>
    </div>
    {captureState && <CaptureDialog key={captureState.key} open initialType={captureState.type} inbox={captureState.inbox} onOpenChange={open => { if (!open) setCaptureState(null); }} />}
    <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
    {toast && <div className="toast" role="status"><Check size={17} /><span>{toast}</span><button className="icon-button" aria-label="Chiudi la notifica" onClick={() => setToast("")}><X size={15} /></button></div>}
  </WorkspaceContext.Provider>;
}

"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useRef,
  type ReactNode,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive,
  Trash2,
  Bot,
  Bookmark,
  Box,
  Check,
  CheckSquare,
  CalendarDays,
  ChevronDown,
  Folder,
  Hash,
  House,
  Inbox,
  Layers3,
  LockKeyhole,
  LogOut,
  Menu,
  Network,
  Plus,
  Search,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import type { ItemType } from "@/features/items/types";
import { CaptureDialog } from "@/features/items/capture-dialog";
import { SearchDialog } from "./search-dialog";
import { WorkspaceContext, type NavigationGuard } from "./workspace-context";
import { Modal } from "./ui";
import "./workspace-shell.css";

const navigation = [
  {
    title: "Organizza",
    items: [
      { href: "/", label: "Inizio", icon: House },
      { href: "/inbox", label: "Da organizzare", icon: Inbox },
      { href: "/tasks", label: "Attività", icon: CheckSquare },
      { href: "/planner", label: "Planner", icon: CalendarDays },
    ],
  },
  {
    title: "Le tue conoscenze",
    items: [
      { href: "/assistant", label: "Assistente AI", icon: Bot },
      { href: "/projects", label: "Progetti", icon: Folder },
      { href: "/areas", label: "Aree", icon: Layers3 },
      { href: "/resources", label: "Risorse", icon: Box },
      { href: "/bookmarks", label: "Preferiti", icon: Bookmark },
    ],
  },
  {
    title: "Esplora",
    items: [
      { href: "/graph", label: "Grafo", icon: Network },
      { href: "/tags", label: "Etichette", icon: Hash },
      { href: "/archive", label: "Archivio", icon: Archive },
      { href: "/trash", label: "Cestino", icon: Trash2 },
    ],
  },
  {
    title: "Spazio",
    items: [
      { href: "/settings", label: "Configurazione", icon: Settings2 },
      { href: "/account", label: "Account", icon: UserRound },
    ],
  },
];
function subscribeDensity(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("synapse:density", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("synapse:density", callback);
  };
}
function readDensity() {
  try {
    return localStorage.getItem("synapse:compact") === "true";
  } catch {
    return false;
  }
}

export function WorkspaceShell({
  children,
  name,
  email,
}: {
  children: ReactNode;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [captureState, setCaptureState] = useState<{
    type: ItemType;
    inbox: boolean;
    key: number;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<string[]>(() =>
    navigation
      .filter(
        (group) =>
          group.title === "Organizza" ||
          group.title === "Esplora" ||
          group.items.some((item) => item.href === pathname),
      )
      .map((group) => group.title),
  );
  const [toast, setToast] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const navigationGuard = useRef<NavigationGuard | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const compact = useSyncExternalStore(
    subscribeDensity,
    readDensity,
    () => false,
  );
  const capture = useCallback(
    (type: ItemType = "RESOURCE", inbox = true) =>
      setCaptureState({ type, inbox, key: Date.now() }),
    [],
  );
  const notify = useCallback((message: string) => setToast(message), []);
  const registerNavigationGuard = useCallback((guard: NavigationGuard | null) => {
    navigationGuard.current = guard;
  }, []);
  const requestNavigation = useCallback(
    (href: string) => {
      if (href === pathname) return true;
      if (navigationGuard.current?.isDirty()) {
        setPendingNavigation(href);
        return false;
      }
      router.push(href);
      return true;
    },
    [pathname, router],
  );
  function guardInternalLink(
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
    closeMobile = false,
  ) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    event.preventDefault();
    requestNavigation(href);
    if (closeMobile) setMobileOpen(false);
  }
  async function continueNavigation(action: "save" | "discard") {
    const href = pendingNavigation;
    const guard = navigationGuard.current;
    if (!href || !guard) return;
    const complete = action === "save" ? await guard.save() : await guard.discard();
    if (!complete) return;
    navigationGuard.current = null;
    setPendingNavigation(null);
    router.push(href);
  }
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((value) => !value);
        return;
      }
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          Boolean(target.closest('[role="combobox"], [role="listbox"]')));
      if (
        !event.defaultPrevented &&
        !editing &&
        !document.querySelector('[role="dialog"]') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key.toLowerCase() === "n"
      ) {
        event.preventDefault();
        capture();
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [capture]);
  useEffect(() => {
    if (toast) {
      const timeout = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timeout);
    }
  }, [toast]);
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production")
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  async function signOut() {
    setSigningOut(true);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error(result.error.message);
      router.push("/login");
      router.refresh();
    } catch {
      notify("Impossibile uscire. Riprova.");
      setSigningOut(false);
    }
  }
  function setDensity(value: boolean) {
    try {
      localStorage.setItem("synapse:compact", String(value));
      window.dispatchEvent(new Event("synapse:density"));
    } catch {
      notify("Il browser non consente di salvare questa preferenza.");
    }
  }
  function toggleNavigationGroup(title: string) {
    setExpandedGroups((groups) =>
      groups.includes(title)
        ? groups.filter((group) => group !== title)
        : [...groups, title],
    );
  }
  const navigationContent = (
    <>
      <Link href="/" className="brand" onClick={(event) => guardInternalLink(event, "/", true)}>
        <span className="brand-mark">
          <Network size={22} strokeWidth={1.65} />
        </span>
        Synapse
      </Link>
      <button
        className="sidebar-search"
        onClick={() => {
          setSearchOpen(true);
          setMobileOpen(false);
        }}
      >
        <Search size={15} />
        <span>Cerca</span>
        <kbd>Ctrl K</kbd>
      </button>
      <nav aria-label="Pagine">
        {navigation.map((group) => (
          <section
            className="nav-group"
            data-expanded={expandedGroups.includes(group.title)}
            key={group.title}
          >
            <h2>
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={expandedGroups.includes(group.title)}
                onClick={() => toggleNavigationGroup(group.title)}
              >
                <span>{group.title}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            </h2>
            <div className="nav-group-items">
              {group.items.map((item) => (
                <Link
                  className={`nav-link ${pathname === item.href ? "active" : ""}`}
                  href={item.href}
                  key={item.href}
                  aria-current={pathname === item.href ? "page" : undefined}
                  onClick={(event) => {
                    if (!expandedGroups.includes(group.title)) {
                      setExpandedGroups((groups) => [...groups, group.title]);
                    }
                    guardInternalLink(event, item.href, true);
                  }}
                >
                  <item.icon size={16} strokeWidth={1.6} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className="button sidebar-capture"
          aria-label="Annotazione rapida"
          onClick={() => {
            capture();
            setMobileOpen(false);
          }}
        >
          <Plus size={16} />
          Nuovo<kbd>N</kbd>
        </button>
        <button
          className="sidebar-preferences"
          onClick={() => {
            setMobileOpen(false);
            setPreferencesOpen(true);
          }}
        >
          <Settings2 size={16} />
          Preferenze
        </button>
        <div className="account">
          <span className="avatar">{name.charAt(0).toUpperCase()}</span>
          <div>
            <strong>{name}</strong>
            <span>Spazio personale</span>
          </div>
          <button
            className="icon-button"
            aria-label="Esci"
            title="Esci"
            onClick={signOut}
            disabled={signingOut}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );
  return (
    <WorkspaceContext.Provider
      value={{
        name,
        capture,
        search: () => setSearchOpen(true),
        notify,
        registerNavigationGuard,
        requestNavigation,
      }}
    >
      <a href="#main-content" className="skip-link">
        Vai al contenuto
      </a>
      <div
        className="workspace"
        data-density={compact ? "compact" : "comfortable"}
      >
        <aside
          className="sidebar"
          aria-label="Navigazione dello spazio personale"
        >
          {navigationContent}
        </aside>
        <div className="workspace-body">
          <header className="topbar">
            <div className="topbar-left">
              <button
                className="icon-button mobile-menu"
                aria-label="Apri il menu"
                aria-expanded={mobileOpen}
                onClick={() => setMobileOpen(true)}
              >
                <Menu size={20} />
              </button>
              <span className="breadcrumb">
                <span className="workspace-location">Spazio personale</span>
                <span className="workspace-location">/</span>
                <strong>
                  {navigation
                    .flatMap((group) => group.items)
                    .find((item) => item.href === pathname)?.label ||
                    "Documento"}
                </strong>
              </span>
            </div>
            <div className="topbar-actions">
              <span className="workspace-status">
                <LockKeyhole size={11} />
                Privato
              </span>
              <button
                className="icon-button"
                aria-label="Cerca"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={17} />
              </button>
              <button
                className="button button-ghost compact"
                aria-label="Annota"
                onClick={() => capture()}
              >
                <Plus size={16} />
                <span>Nuovo</span>
              </button>
            </div>
          </header>
          <main
            id="main-content"
            tabIndex={-1}
            className={
              pathname === "/graph" ? "main-content graph-main" : "main-content"
            }
          >
            {children}
          </main>
        </div>
        <nav className="mobile-bottom-nav" aria-label="Navigazione rapida">
          <Link
            href="/planner"
            aria-current={pathname === "/planner" ? "page" : undefined}
            onClick={(event) => guardInternalLink(event, "/planner")}
          >
            <CalendarDays size={19} />
            <span>Piano</span>
          </Link>
          <Link
            href="/inbox"
            aria-current={pathname === "/inbox" ? "page" : undefined}
            onClick={(event) => guardInternalLink(event, "/inbox")}
          >
            <Inbox size={19} />
            <span>Da organizzare</span>
          </Link>
          <button
            className="mobile-capture"
            onClick={() => capture()}
            aria-label="Annotazione rapida"
          >
            <Plus size={23} />
          </button>
          <button onClick={() => setSearchOpen(true)}>
            <Search size={19} />
            <span>Cerca</span>
          </button>
          <button
            onClick={() => setMobileOpen(true)}
            aria-expanded={mobileOpen}
          >
            <Menu size={19} />
            <span>Altro</span>
          </button>
        </nav>
      </div>
      <Modal
        open={mobileOpen}
        onOpenChange={setMobileOpen}
        title="Synapse"
        description="Navigazione dello spazio personale"
        className="navigation-dialog"
      >
        {navigationContent}
      </Modal>
      <Modal
        open={pendingNavigation !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavigation(null);
        }}
        title="Ci sono modifiche non salvate"
        description="Salva le modifiche prima di cambiare pagina, oppure scartale."
      >
        <div className="dialog-footer">
          <button className="button button-secondary" onClick={() => setPendingNavigation(null)}>
            Rimani nella pagina
          </button>
          <button className="button button-secondary" onClick={() => void continueNavigation("discard")}>
            Scarta e continua
          </button>
          <button className="button button-primary" onClick={() => void continueNavigation("save")}>
            Salva e continua
          </button>
        </div>
      </Modal>
      <Modal
        open={preferencesOpen}
        onOpenChange={setPreferencesOpen}
        title="Preferenze"
        description="Personalizza questo browser."
      >
        <div className="preferences-options">
          <label className="preference-toggle">
            <span>Liste compatte</span>
            <input
              type="checkbox"
              checked={compact}
              onChange={(event) => setDensity(event.target.checked)}
            />
          </label>
          <div className="shortcuts-list">
            <h3>Scorciatoie</h3>
            <div>
              <span>Cerca e comandi</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </div>
            <div>
              <span>Nuovo pensiero</span>
              <kbd>N</kbd>
            </div>
            <div>
              <span>Salva un’annotazione</span>
              <kbd>Ctrl / ⌘ ↵</kbd>
            </div>
            <div>
              <span>Chiudi finestra</span>
              <kbd>Esc</kbd>
            </div>
          </div>
          <p className="preferences-account">
            {name}
            <br />
            {email}
          </p>
        </div>
      </Modal>
      {captureState && (
        <CaptureDialog
          key={captureState.key}
          open
          initialType={captureState.type}
          inbox={captureState.inbox}
          onOpenChange={(open) => {
            if (!open) setCaptureState(null);
          }}
        />
      )}
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Chiudi la notifica"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}

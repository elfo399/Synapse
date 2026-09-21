"use client";

import { useState } from "react";
import { Check, KeyRound, LoaderCircle } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import "./account.css";

export function AccountForm({
  username,
  email,
}: {
  username: string;
  email: string;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    setSaved(false);
    if (newPassword !== confirmation) {
      setError("Le nuove password non coincidono.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Scegli una password diversa da quella attuale.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Troppi tentativi. Attendi un minuto e riprova."
            : result.error.status === 401
              ? "La sessione è scaduta. Accedi di nuovo e riprova."
              : "Password non aggiornata. Controlla la password attuale e usa da 12 a 128 caratteri per quella nuova.",
        );
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      setSaved(true);
    } catch {
      setError("Impossibile connettersi. Riprova.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="account-page">
      <header className="account-heading">
        <h1>Il tuo account</h1>
        <p>Gestisci la password del tuo spazio personale.</p>
      </header>
      <dl className="account-identity">
        <div>
          <dt>Nickname</dt>
          <dd>{username || "Non impostato"}</dd>
        </div>
        <div>
          <dt>Indirizzo email</dt>
          <dd>{email}</dd>
        </div>
      </dl>
      <section className="account-security" aria-labelledby="password-heading">
        <h2 id="password-heading">
          <KeyRound size={19} aria-hidden="true" /> Cambia password
        </h2>
        <p>
          Scegli da 12 a 128 caratteri. Dopo il salvataggio gli altri
          dispositivi dovranno accedere di nuovo.
        </p>
        <form
          onSubmit={submit}
          aria-busy={busy}
          className="account-password-form"
        >
          <label htmlFor="current-password">Password attuale</label>
          <input
            id="current-password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <label htmlFor="new-password">Nuova password</label>
          <input
            id="new-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <label htmlFor="confirm-password">Conferma nuova password</label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {saved && (
            <p className="account-saved" role="status">
              <Check size={17} /> Password aggiornata. Dal prossimo accesso usa
              quella nuova.
            </p>
          )}
          <button
            type="submit"
            className="button button-primary"
            disabled={busy}
          >
            {busy && <LoaderCircle size={16} className="spin" />}
            {busy ? "Salvataggio…" : "Salva password"}
          </button>
        </form>
      </section>
    </div>
  );
}

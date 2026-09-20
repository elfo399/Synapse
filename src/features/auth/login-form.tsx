"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Network,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import "./login.css";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          result.error.status === 429
            ? "Troppi tentativi di accesso. Attendi un minuto e riprova."
            : "Accesso non riuscito. Controlla email e password.",
        );
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Impossibile connettersi. Riprova.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-content" aria-labelledby="login-title">
        <Link href="/" className="login-brand" aria-label="Synapse">
          <Network size={25} strokeWidth={1.65} aria-hidden="true" />
          <span>Synapse</span>
        </Link>
        <header className="login-heading">
          <h1 id="login-title">Il tuo spazio personale.</h1>
          <p>Accedi per riprendere da dove eri rimasto.</p>
        </header>
        <form className="login-form" onSubmit={submit} aria-busy={busy}>
          <label htmlFor="login-email">
            Indirizzo email
            <input
              id="login-email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              placeholder="tu@esempio.it"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label htmlFor="login-password">Password</label>
          <div className="login-password-field">
            <input
              id="login-password"
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="Inserisci la password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={
                passwordVisible ? "Nascondi password" : "Mostra password"
              }
              aria-pressed={passwordVisible}
              onClick={() => setPasswordVisible((value) => !value)}
            >
              {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <button
            className="button button-primary"
            disabled={busy}
            type="submit"
          >
            {busy ? (
              <LoaderCircle size={16} className="spin" />
            ) : (
              <ArrowRight size={16} aria-hidden="true" />
            )}
            Accedi
          </button>
        </form>
        <p className="login-note">
          <LockKeyhole size={12} aria-hidden="true" />
          Accesso privato · Server personale
        </p>
      </section>
    </main>
  );
}

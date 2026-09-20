"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, BrainCircuit, LoaderCircle, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) { setError((result.error.status === 429 ? "Troppi tentativi di accesso. Attendi un minuto e riprova." : "Accesso non riuscito. Controlla email e password.")); return; }
      router.push("/"); router.refresh();
    } catch { setError("Impossibile connettersi. Riprova."); } finally { setBusy(false); }
  }
  return <main className="login-page"><div className="login-story"><Link href="/" className="brand"><span className="brand-mark"><BrainCircuit size={25} /></span><span>Synapse</span></Link><div><div className="eyebrow">IDEE CHIARE. CONNESSIONI PROFONDE.</div><h1>Un po’ meno rumore.<br />Un po’ più di <em>chiarezza.</em></h1><p>Uno spazio privato per le tue idee, le tue conoscenze e ciò che vuoi realizzare.</p><div className="login-orbit" aria-hidden="true"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit orbit-three" /><span className="orbit-center"><BrainCircuit size={42} /></span><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /><span className="orbit-dot dot-three" /></div></div><div className="private-indicator"><ShieldCheck size={15} />Le tue conoscenze appartengono a te.</div></div><div className="login-form-side"><form className="login-form" onSubmit={submit}><span className="login-welcome">IL TUO SPAZIO PERSONALE</span><h2>Bentornato.</h2><p>La tua prossima idea nasce qui.</p><label>Indirizzo email<input type="email" autoComplete="username" required placeholder="tu@esempio.it" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input type="password" autoComplete="current-password" required placeholder="Inserisci la password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p role="alert" className="form-error">{error}</p>}<button className="button button-primary" disabled={busy} type="submit">{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}Accedi</button><p className="login-note"><ShieldCheck size={14} />Privato per scelta. Ospitato sul tuo server.</p></form></div></main>;
}

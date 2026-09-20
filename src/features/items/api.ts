export async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(typeof message === "string" ? message : "Si è verificato un errore. Riprova.");
  }
  return payload as T;
}
export function changed() { window.dispatchEvent(new Event("secondbrain:changed")); }
export function errorMessage(error: unknown) {
  if (error instanceof TypeError) return "Impossibile connettersi al server. Controlla la connessione e riprova.";
  return error instanceof Error ? error.message : "Si è verificato un errore. Riprova.";
}

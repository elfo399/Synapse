const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

/** Loopback aliases share a local deployment, but never broaden remote trust. */
export function getTrustedOrigins(baseURL: string): string[] {
  const configured = new URL(baseURL);
  if (!LOOPBACK_HOSTS.some((host) => host === configured.hostname)) {
    return [configured.origin];
  }
  return LOOPBACK_HOSTS.map((host) => {
    const alias = new URL(configured.origin);
    alias.hostname = host;
    return alias.origin;
  });
}

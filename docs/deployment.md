# Deployment on Raspberry Pi 5

## Host and storage

Use Raspberry Pi OS **64-bit** or another supported ARM64 Linux distribution. Verify `uname -m` prints `aarch64`. Install Docker Engine and the Compose plugin using the [official Debian installation instructions](https://docs.docker.com/engine/install/debian/) for your host; install Tailscale on the host if using it for access. Docker group membership grants root-equivalent host control.

Use an SSD/NVMe drive for Docker's data directory when possible. Avoid putting the only copy of your database on an SD card. Keep enough space for the image build, PostgreSQL volume, and at least two complete backups. A reliable power supply and orderly shutdown reduce storage-corruption risk. Do not place PostgreSQL's live data directory on an unreliable network filesystem.

Production uses the `secondbrain_secondbrain-data` named volume by default. It is mounted at `/var/lib/postgresql/data`. The application stores no user content on its own writable filesystem. Both services restart unless deliberately stopped; logs rotate at 10 MB × 3 files per service.

## Install

```bash
git clone <your-repository-url> secondbrain
cd secondbrain
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
openssl rand -hex 32
```

Put the two independent random values in `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET`. Set `INITIAL_ADMIN_EMAIL`, a strong `INITIAL_ADMIN_PASSWORD` of at least 12 characters, and your final `BETTER_AUTH_URL`. Leave `WEB_BIND_ADDRESS=127.0.0.1` for Tailscale Serve.

```bash
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:3000/api/health
```

Build directly on the Pi for native ARM64 images. Node's Debian image and PostgreSQL's image support ARM64; Prisma generation includes `linux-arm64-openssl-3.0.x`. The image installs OpenSSL and keeps the Prisma engines and startup tooling. See [Prisma's runtime requirements](https://docs.prisma.io/docs/orm/reference/system-requirements). Do not copy Windows `node_modules` into the image; `.dockerignore` excludes them.

Building on a different host for the Pi requires a multi-platform builder, for example `docker buildx build --platform linux/arm64 --load -t secondbrain:local .`. Emulated builds are slower. An image build for AMD64 alone does not establish ARM64 runtime verification.

## Tailscale HTTPS

Join the Pi and your client devices to your tailnet; apply tailnet access rules appropriate to your private workspace. Enable MagicDNS/HTTPS when prompted. On the Pi:

```bash
tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

Set `BETTER_AUTH_URL` to the exact HTTPS URL reported by Tailscale, such as `https://secondbrain.your-tailnet.ts.net`, then recreate the web container:

```bash
docker compose up -d --wait secondbrain-web
```

Open that URL from a tailnet device and sign in. Add the app to your phone's home screen from the browser. Tailscale Serve provides a private HTTPS reverse proxy; no router port forwarding is needed. Its CLI and HTTPS enablement are described in the [official Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [command reference](https://tailscale.com/docs/reference/tailscale-cli/serve). Use **Serve**, not public Funnel, for this private deployment.

PostgreSQL remains inside Docker's network. Never publish port 5432 to the LAN or tailnet for routine application use. Tailscale is optional infrastructure outside the application containers.

## LAN access

Use a TLS reverse proxy on the host or LAN and set `BETTER_AUTH_URL` to its HTTPS origin. A host proxy can continue using `127.0.0.1:3000`. If the proxy is on another trusted machine, bind `WEB_BIND_ADDRESS` to the Pi's specific LAN address, permit only that proxy through the host firewall, and forward the original host/protocol correctly. Do not expose the plain HTTP backend to the public internet.

One canonical external origin is supported per deployment. Use the same Tailscale HTTPS URL on the LAN and remotely when possible. A raw HTTP LAN IP is intentionally rejected as a production auth origin; production session cookies need secure transport.

For a local deployment configured with a loopback URL, `localhost`, `127.0.0.1`, and `[::1]` are trusted aliases with the same scheme and port. Both authentication and application mutations use this exact allowlist. This does not add aliases for a public/LAN hostname, and does not change which interfaces Docker publishes. Cookies remain scoped to the browser hostname, so sign in separately when switching aliases.

## Health and operation

```bash
docker compose ps
docker compose logs --tail=100 secondbrain-web
docker compose logs --tail=100 secondbrain-db
docker compose exec secondbrain-db pg_isready -U secondbrain -d secondbrain
```

Use [operations](operations.md) for backups and upgrades. After initial login, remove `INITIAL_ADMIN_PASSWORD` from `.env` and recreate the web container. Existing accounts are never reset during bootstrap.

## Troubleshooting

| Symptom                                            | Check                                                                                                                                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose reports a missing variable                 | Fill both required secrets in `.env`; run `docker compose config --quiet`. Avoid printing resolved config into shared logs.                                                       |
| First startup exits at bootstrap                   | Configure a valid initial email and password; inspect the web log for the validation message.                                                                                     |
| Database authentication fails after editing `.env` | `POSTGRES_PASSWORD` initializes a new volume only. Changing it does not rotate an existing database role password. Rotate deliberately in PostgreSQL and update the app together. |
| Login loops or invalid origin                      | Browser origin must exactly match `BETTER_AUTH_URL`, including scheme and port. Recreate web after changes. Use HTTPS outside localhost.                                          |
| Unhealthy web                                      | Inspect migration/bootstrap errors; verify DB health and free disk space. The app waits for successful migrations before serving.                                                 |
| Prisma engine/OpenSSL error                        | Build the image natively for the target architecture; retain the Debian OpenSSL package and generated engines.                                                                    |
| Port conflict                                      | Change `WEB_PORT` and update Tailscale's target, or stop the process already using the port.                                                                                      |
| Slow graph on a phone                              | Narrow type/tag/project filters or open an Item's local neighborhood. The full database is never sent as an unbounded graph.                                                      |
| Cannot install PWA                                 | Use HTTPS and a supporting browser; Safari uses Share → Add to Home Screen.                                                                                                       |
| Notes unavailable offline                          | Expected in V1. The service worker does not cache private APIs or queue writes. Reconnect before capturing.                                                                       |

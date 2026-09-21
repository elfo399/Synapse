# syntax=docker/dockerfile:1
# Debian/glibc avoids Alpine/OpenSSL engine mismatches on Raspberry Pi ARM64.
FROM node:22.23.2-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM base AS build
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# These non-secret placeholders are used only while compiling. No database is
# accessed at build time, and deployment secrets are supplied at runtime.
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    npx prisma generate
RUN DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret-000000 \
    BETTER_AUTH_URL=http://localhost:3000 \
    npm run build
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN groupadd --system --gid 1001 secondbrain \
    && useradd --system --uid 1001 --gid secondbrain --create-home secondbrain
COPY --from=build --chown=secondbrain:secondbrain /app/.next/standalone ./
# Migration/bootstrap tooling and generated Prisma engines must survive Next's
# output tracing. prisma and tsx are intentional production dependencies.
COPY --from=build --chown=secondbrain:secondbrain /app/node_modules ./node_modules
COPY --from=build --chown=secondbrain:secondbrain /app/.next/static ./.next/static
COPY --from=build --chown=secondbrain:secondbrain /app/public ./public
COPY --from=build --chown=secondbrain:secondbrain /app/prisma ./prisma
COPY --from=build --chown=secondbrain:secondbrain /app/scripts ./scripts
COPY --from=build --chown=secondbrain:secondbrain /app/src ./src
COPY --from=build --chown=secondbrain:secondbrain /app/tsconfig.json ./tsconfig.json
RUN chmod 0755 scripts/docker-entrypoint.sh \
    && mkdir -p .next/cache /data/attachments/objects \
    && chown -R secondbrain:secondbrain .next/cache /data/attachments \
    && chmod 0700 /data/attachments /data/attachments/objects
USER secondbrain
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
CMD ["node", "server.js"]

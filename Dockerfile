# syntax=docker/dockerfile:1

# =========================================================================
#  Multi-Stage-Build für die Passwortmanager-Übungs-Demo
#  - build   : installiert Abhängigkeiten (inkl. nativer Module) + vendored JS
#  - test    : führt die Test-Suite aus  (docker build --target test ...)
#  - runtime : schlankes Production-Image, non-root, persistente DB unter /data
# =========================================================================

# ---- Build-Stage: Toolchain für native Module (better-sqlite3, argon2) ----
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
# scripts/ vor `npm ci` kopieren, da das postinstall (vendor-webauthn.js) es braucht.
COPY scripts ./scripts
# Es gibt keine devDependencies -> node_modules enthält nur Produktionspakete.
RUN npm ci
COPY . .
RUN npm run vendor

# ---- Test-Stage: `docker build --target test .` lässt npm test laufen ----
# Dummy-Secrets nur im RUN (nicht als ENV) -> nicht im Image-Layer hinterlegt.
FROM build AS test
RUN NODE_ENV=test \
    APP_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000 \
    SESSION_SECRET=docker-test-secret \
    npm test

# ---- Runtime-Stage: schlank, ohne Toolchain, als non-root ----
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/app.db
WORKDIR /app

# Kompilierte node_modules + App aus dem Build übernehmen (gleiche Basis -> ABI passt).
COPY --from=build /app /app

# Persistenter Datenpfad, der dem unprivilegierten Nutzer gehört.
RUN mkdir -p /data && chown -R node:node /app /data
USER node

EXPOSE 3000
VOLUME ["/data"]

# Healthcheck gegen die öffentliche Startseite.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

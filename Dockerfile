# Altores build of the Flowise monorepo.
# docker build -t flowise .
# docker run -d -p 3000:3000 flowise
#
# Two stages: the build stage installs every dependency and compiles; the runtime stage
# only receives production dependencies and the build output. Build tools (turbo, esbuild,
# vite, the pnpm store) and the global npm/pnpm never reach the runtime image, which keeps
# them out of the Trivy image scan and off the attack surface.

FROM node:24-alpine AS build

RUN apk add --no-cache libc6-compat python3 make g++ build-base cairo-dev pango-dev && \
    npm install -g pnpm@10.26.0

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV NODE_OPTIONS=--max-old-space-size=8192

WORKDIR /usr/src/flowise
COPY . .

# Install, build (excluding the sdk packages not needed for Docker), then prune to production
# dependencies only, from the store this stage already filled (lifecycle scripts already ran;
# native modules come back from the side-effects cache).
RUN pnpm install --frozen-lockfile && \
    pnpm build:docker && \
    CI=true pnpm prune --prod --ignore-scripts

FROM node:24-alpine

# Runtime libraries only (cairo/pango for canvas, chromium for the web loaders).
# `apk upgrade` first: packages already in the base image are not updated by `apk add`,
# so a fixed CVE in one of them (libxslt, 11/2026) kept failing the image scan.
RUN apk upgrade --no-cache && \
    apk add --no-cache libc6-compat cairo pango libjpeg-turbo giflib pixman librsvg chromium curl && \
    rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV NODE_OPTIONS=--max-old-space-size=8192

WORKDIR /usr/src/flowise
COPY --from=build --chown=node:node /usr/src/flowise /usr/src/flowise

# Data directory (encryption key, local storage, logs) owned by the runtime user, so a fresh
# named volume mounted there inherits that ownership.
RUN mkdir -p /home/node/.flowise && chown node:node /home/node/.flowise

USER node

EXPOSE 3000

WORKDIR /usr/src/flowise/packages/server/bin
CMD [ "node", "run", "start" ]

# oojam.dev site image. Protected: builds must not change this file.
#
# The deployer runs it with a read-only root filesystem and a tmpfs at /tmp, so nothing
# may write anywhere else at runtime. Runtime env: DATABASE_URL, PORT, GIT_SHA.
#   Serve:    docker run ... oojam-site            (npm start, port 3000)
#   Migrate:  docker run ... oojam-site npm run db:migrate

FROM node:22.23.3-bookworm-slim AS base
WORKDIR /app
ENV npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false

# All dependencies, for checking and building.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Typecheck and test. The build stage starts from here, so a failure stops the image.
FROM deps AS check
COPY . .
RUN npm run check && npm test

FROM check AS build
RUN npm run build

# Production dependencies only.
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    npm_config_cache=/tmp/.npm
COPY package.json package-lock.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY scripts ./scripts
COPY content ./content
USER node
EXPOSE 3000
CMD ["npm", "start"]

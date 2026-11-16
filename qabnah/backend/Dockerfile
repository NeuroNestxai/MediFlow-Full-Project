# syntax=docker/dockerfile:1
# Qabnah API / worker image (same image, different command).
# Behind a TLS-intercepting proxy, pass its CA as an optional build secret:
#   docker build --secret id=extra_ca,src=/path/to/ca.crt -t qabnah/backend:dev .
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=extra_ca,required=false sh -c '[ -f /run/secrets/extra_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; npm ci'
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=extra_ca,required=false sh -c '[ -f /run/secrets/extra_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; npm ci --omit=dev && npm cache clean --force'
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
RUN mkdir -p /app/storage && chown -R node:node /app/storage
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://127.0.0.1:4000/v1/health || exit 1
CMD ["node", "dist/server.js"]

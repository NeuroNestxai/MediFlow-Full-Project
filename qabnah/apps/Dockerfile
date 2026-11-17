# syntax=docker/dockerfile:1
# Builds one of the web apps (APP=merchant | admin | site) and serves it with nginx.
#   docker build --build-arg APP=merchant --build-arg VITE_API_URL=https://api.example.om/v1 -t qabnah/merchant-web .
# Behind a TLS-intercepting proxy add: --secret id=extra_ca,src=/path/to/ca.crt
FROM node:22-alpine AS build
ARG APP=merchant
ARG VITE_API_URL=http://localhost:4000/v1
# site only: where "browse stores" / "register your store" links point (the merchant web app)
ARG VITE_MERCHANT_URL=http://localhost:5173
ARG VITE_CONTACT_EMAIL=
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY merchant/package.json merchant/
COPY admin/package.json admin/
COPY site/package.json site/
COPY e2e/package.json e2e/
RUN --mount=type=secret,id=extra_ca,required=false sh -c '[ -f /run/secrets/extra_ca ] && export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci'
COPY tsconfig.base.json ./
COPY shared shared
COPY ${APP} ${APP}
ENV VITE_API_URL=${VITE_API_URL} VITE_MERCHANT_URL=${VITE_MERCHANT_URL} VITE_CONTACT_EMAIL=${VITE_CONTACT_EMAIL}
RUN npm run build -w @qabnah/${APP}

FROM nginx:1.27-alpine
ARG APP=merchant
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/${APP}/dist /usr/share/nginx/html
EXPOSE 80

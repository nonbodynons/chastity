# syntax = docker/dockerfile:1

ARG NODE_VERSION=18.16.1
FROM node:${NODE_VERSION}-slim as base
WORKDIR /app

FROM base as build
COPY --link package-lock.json package.json ./
RUN npm ci
COPY --link . .
RUN npm run build
RUN npm prune --omit dev

FROM base
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/views /app/views
EXPOSE 8080
CMD [ "dist/index.js" ]

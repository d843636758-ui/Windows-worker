FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json tsconfig.base.json ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY server/package.json server/tsconfig.json ./server/
COPY worker/package.json worker/tsconfig.json ./worker/
RUN npm ci
COPY shared/src ./shared/src
COPY server/src ./server/src
RUN npm run build -w @local-browser/shared && npm run build -w @local-browser/server

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
COPY --from=build /app/shared/package.json ./shared/
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/node_modules ./node_modules
USER node
CMD ["node", "server/dist/index.js"]

FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY game.mjs server.mjs arena.mjs map-layout-source.cjs obstacle-layout-source.cjs ./
USER node
ENV NODE_ENV=production PORT=8080
EXPOSE 8080
CMD ["node","server.mjs"]

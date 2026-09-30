FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --ignore-scripts
COPY *.mjs ./
ENV NODE_ENV=production
EXPOSE 8780
CMD ["node","server.mjs"]

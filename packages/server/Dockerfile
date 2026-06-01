FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/server/package.json ./packages/server/
RUN npm ci -w @steam-bot/server --omit=dev 2>/dev/null || npm install -w @steam-bot/server --omit=dev
COPY packages/server ./packages/server
WORKDIR /app/packages/server
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]

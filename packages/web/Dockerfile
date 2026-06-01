FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/web/package.json ./packages/web/
RUN npm ci --workspace=@steam-bot/web
COPY packages/web ./packages/web
RUN npm run build -w @steam-bot/web

FROM nginx:alpine
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/packages/web/dist /usr/share/nginx/html
EXPOSE 80

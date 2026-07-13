FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_OPENROUTER_API_KEY=""
ARG VITE_REMOTE_STORAGE_URL=""
ENV VITE_OPENROUTER_API_KEY=${VITE_OPENROUTER_API_KEY}
ENV VITE_REMOTE_STORAGE_URL=${VITE_REMOTE_STORAGE_URL}

RUN npm run build-only

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

RUN chown -R nginx:nginx /usr/share/nginx/html

USER nginx
EXPOSE 8080

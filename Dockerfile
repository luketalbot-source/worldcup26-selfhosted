# ============================================
# Stage 1: Build the Vite React application
# ============================================
FROM node:20-alpine AS build

# git is needed at build time only: vite.config.ts bakes `git rev-parse
# --short HEAD` into the bundle as the build stamp shown in the profile
# diagnostics panel (.git is allowed into the context for the same
# reason). Multi-stage build — neither git nor .git reaches the final
# nginx image.
RUN apk add --no-cache git

WORKDIR /app

# VITE_ env vars must be present at build time because Vite
# statically replaces them in the JS bundle during compilation.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Copy dependency manifests first for Docker layer caching
COPY package.json package-lock.json ./

# Install dependencies (clean install for reproducibility)
RUN npm ci

# Copy the rest of the source code
COPY . .

# Build the production bundle
RUN npm run build

# ============================================
# Stage 2: Serve with nginx
# ============================================
FROM nginx:stable-alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy our custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the built static files from the build stage
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx resolves `proxy_pass http://api:3000/...` once at config-load time.
# In a fresh Northflank deploy, the api service's DNS entry isn't always in
# the cluster resolver yet when web starts — nginx hits "host not found in
# upstream" and the container crash-loops. Wait for the hostname before
# starting nginx; fail loudly after a generous timeout so we don't hang
# forever on a real outage. getent hosts is part of the Alpine base.
CMD ["/bin/sh", "-c", "i=0; until getent hosts api >/dev/null 2>&1; do i=$((i+1)); if [ $i -gt 60 ]; then echo 'api hostname never resolved after 120s, giving up' >&2; exit 1; fi; echo \"waiting for api hostname (try $i)...\"; sleep 2; done; echo 'api resolved, starting nginx'; exec nginx -g 'daemon off;'"]

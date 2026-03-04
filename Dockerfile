# ============================================
# Stage 1: Build the Vite React application
# ============================================
FROM node:20-alpine AS build

WORKDIR /app

# VITE_ env vars must be present at build time because Vite
# statically replaces them in the JS bundle during compilation.
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

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

CMD ["nginx", "-g", "daemon off;"]

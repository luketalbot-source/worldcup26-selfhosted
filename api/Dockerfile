FROM oven/bun:1 AS base
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY src ./src
COPY tsconfig.json ./
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", "src/index.ts"]

FROM oven/bun:1 AS base
WORKDIR /app
COPY api/package.json ./
RUN bun install --production
COPY api/src ./src
COPY api/tsconfig.json ./
EXPOSE 3000
ENV NODE_ENV=production
CMD ["bun", "run", "src/index.ts"]

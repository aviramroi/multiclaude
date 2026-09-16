FROM oven/bun:1
WORKDIR /app
COPY package.json bun.lock* tsconfig.json ./
RUN bun install --production
COPY src ./src
ENV PORT=4747 MULTICLAUDE_DB=/data/multiclaude.db
VOLUME /data
EXPOSE 4747
CMD ["bun", "run", "src/server/index.ts"]

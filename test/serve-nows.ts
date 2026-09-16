// Serves the app without WebSocket support (what Vercel looks like) — used by test/e2e-poll.sh
import { createApp } from "../src/server/app"
import { sqliteStore } from "../src/server/store-sqlite"
const app = createApp({ store: sqliteStore(process.env.MULTICLAUDE_DB ?? "nows.db") })
Bun.serve({ port: Number(process.env.PORT ?? 47480), idleTimeout: 60, fetch: (r) => app.fetch(r) })
console.log("no-ws server on", process.env.PORT)

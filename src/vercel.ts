// Vercel entrypoint (Node runtime, web-standard handler). Bundled by `bun run build:vercel` into api/index.mjs;
// vercel.json rewrites every route here. No WebSockets on serverless: clients fall back to long polling.
import { createApp } from "./server/app"
import { pgStore } from "./server/store-pg"

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL
if (!url) throw new Error("DATABASE_URL is not set")
const app = createApp({ store: pgStore(url), publicUrl: process.env.PUBLIC_URL })

// Vercel uses the web-standard (Request → Response) signature only for method-named exports.
function handler(req: Request) {
  if (req.url.startsWith("/")) {
    const proto = req.headers.get("x-forwarded-proto") ?? "https"
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "localhost"
    req = new Request(`${proto}://${host}${req.url}`, req)
  }
  return app.fetch(req)
}
export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const HEAD = handler
export const OPTIONS = handler

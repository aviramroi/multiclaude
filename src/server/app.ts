import type { Store, User, Session, StoredEntry } from "./store"
import type { WireEntry } from "../core/transcript"
import { landing, claimPage, accountPage, signInPage, joinPage, agentInstructions, agentIndex, prompts, adminPage, type AgentAction } from "./web"
import { installScript } from "./install"
import { sendClaimCode, sendMail, loadMailConfig, SMTP_PRESETS, type MailConfig } from "./mail"

export const VERSION = "0.2.0"

export interface AppOptions {
  store: Store
  publicUrl?: string
  /** called after entries are stored so a realtime layer (Bun WebSocket rooms) can fan out */
  onEntries?: (sessionId: string, entries: StoredEntry[]) => void
  /** true when a WebSocket upgrade is possible; the request is handed back to the host via `upgrade` */
  upgrade?: (req: Request, data: { sessionId: string; user: User }) => Response | undefined
}

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", ...headers } })
const redirect = (to: string, headers: Record<string, string> = {}) => new Response(null, { status: 303, headers: { location: to, ...headers } })
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } })
const err = (msg: string, status: number) => json({ error: msg }, status)
const rid = () => crypto.randomUUID()
const key = () => crypto.randomUUID().replace(/-/g, "").slice(0, 20)
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length < 200
const form = async (req: Request) => Object.fromEntries((await req.formData()).entries()) as Record<string, string>
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createApp(opts: AppOptions) {
  const { store } = opts

  const origin = (req: Request, url: URL) => {
    if (opts.publicUrl) return opts.publicUrl.replace(/\/$/, "")
    const proto = req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host
    return `${proto}://${host}`
  }
  const auth = async (req: Request, url: URL) => {
    const h = req.headers.get("authorization")
    const token = h?.startsWith("Bearer ") ? h.slice(7) : url.searchParams.get("token")
    return token ? store.userByToken(token) : null
  }
  const canAccess = async (s: Session, user: User | null, shareKey: string | null) =>
    (shareKey && shareKey === s.share_key) || (!!user && (s.owner === user.id || (await store.isMember(s.id, user.id))))
  const withMeta = async (s: Session, includeKey: boolean) => {
    const h = await store.head(s.id)
    const { share_key, ...rest } = s
    return { ...rest, ...(includeKey ? { share_key } : {}), head: h.head, entries: h.n }
  }
  const mail = () => loadMailConfig(store)
  const issueOtp = async (email: string, host: string) => {
    const code = String(Math.floor(100000 + Math.random() * 900000))
    await store.setOtp(email, code, Date.now() + 10 * 60_000)
    await sendClaimCode(await mail(), email, code, host)
  }
  /** the first person to approve a machine becomes the server admin */
  const isAdmin = async (email: string | null) => !!email && (await store.getSetting("admin_email")) === email
  const claimAdminIfFirst = async (email: string) => {
    if (!(await store.getSetting("admin_email"))) await store.setSetting("admin_email", email)
  }
  const parseMailForm = (b: Record<string, string>): MailConfig => {
    const provider = b.provider === "smtp" ? "smtp" : "resend"
    const from = (b.from ?? "").trim()
    if (!from) throw new Error("From address is required")
    if (provider === "resend") {
      if (!b.resendKey?.trim()) throw new Error("Resend API key is required")
      return { provider, from, resendKey: b.resendKey.trim() }
    }
    const preset = SMTP_PRESETS[b.preset ?? ""]
    const host = (b.smtpHost || preset?.host || "").trim()
    if (!host) throw new Error("SMTP host is required")
    const port = Number(b.smtpPort || preset?.port || 587)
    return { provider, from, smtpHost: host, smtpPort: port, smtpUser: b.smtpUser?.trim() || undefined, smtpPass: b.smtpPass || undefined, smtpSecure: b.smtpSecure ? true : preset ? preset.secure : port === 465 }
  }
  const checkOtp = async (email: string, code: string) => {
    const row = await store.getOtp(email)
    if (!row || row.expires_at < Date.now() || row.attempts >= 5) return false
    if (row.code !== code) {
      await store.bumpOtp(email)
      return false
    }
    await store.deleteOtp(email)
    return true
  }
  const browserLogin = async (email: string, secure: boolean) => {
    const id = rid()
    await store.createBrowserSession(id, email)
    return { "set-cookie": `mc_web=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure ? "; Secure" : ""}` }
  }
  const browserUser = async (req: Request) => {
    const m = /(?:^|;\s*)mc_web=([0-9a-f-]{36})/.exec(req.headers.get("cookie") ?? "")
    return m ? store.browserEmail(m[1]) : null
  }

  /** Store new entries (dedupe by id) and notify the realtime layer. */
  async function addEntries(sessionId: string, user: User, entries: WireEntry[]) {
    const valid = entries.filter((e) => e?.id && typeof e.raw === "string")
    const added = valid.length ? await store.insertEntries(sessionId, valid, user.name) : []
    if (added.length) {
      await store.touch(sessionId)
      opts.onEntries?.(sessionId, added)
    }
    return added
  }

  async function fetch(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const path = url.pathname.replace(/\/+$/, "") || "/"
    const base = origin(req, url)
    const secure = base.startsWith("https")

    if (path === "/health") return json({ ok: true, version: VERSION })
    if (path === "/" && req.method === "GET") return html(landing(base))
    if (path === "/install.sh") return new Response(installScript(base), { headers: { "content-type": "text/x-shellscript" } })

    const text = (b: string) => new Response(b, { headers: { "content-type": "text/plain; charset=utf-8" } })
    if (path === "/agent" || path === "/agent.md") return text(agentIndex(base))
    const am = path.match(/^\/agent\/(setup|share|catchup|live|email)$/)
    if (am) return text(agentInstructions(base, am[1] as AgentAction))
    const joinM = path.match(/^\/j\/([A-Za-z0-9]{8,64})(\/agent)?$/)
    if (joinM) {
      const mode = url.searchParams.get("mode") === "live" ? "live" : "turn"
      if (joinM[2]) return text(agentInstructions(base, "join", { key: joinM[1], mode }))
      return html(joinPage({ host: base, key: joinM[1], mode, sessions: await store.countByKey(joinM[1]) }))
    }

    const claim = path.match(/^\/claim\/([A-Za-z0-9_-]{8,64})(?:\/(start|verify))?$/)
    if (claim) {
      const u = await store.userByClaim(claim[1])
      if (!u) return html(signInPage("That approval link is not valid."), 404)
      const created = new Date(u.created_at ?? Date.now()).toUTCString()
      const mc = await mail()
      const common = { code: claim[1], user: u.name, created, claimed: u.email && u.claimed_at ? u.email : null, host: base, otp: !!mc }
      if (!claim[2]) return html(claimPage({ ...common, step: "email" }))
      const body = await form(req)
      const email = (body.email ?? "").trim().toLowerCase()
      if (!validEmail(email)) return html(claimPage({ ...common, step: "email", email, error: "Enter a valid email." }), 400)
      if (claim[2] === "start") {
        if (!mc) {
          // no mail provider yet: the approval link itself (handed over by the user's own agent) is the proof
          await store.claimUser(u.id, email)
          await claimAdminIfFirst(email)
          return html(claimPage({ ...common, step: "done", email }), 200, await browserLogin(email, secure))
        }
        await issueOtp(email, base)
        return html(claimPage({ ...common, step: "code", email }))
      }
      if (!(await checkOtp(email, body.otp ?? ""))) return html(claimPage({ ...common, step: "code", email, error: "Wrong or expired code." }), 400)
      await store.claimUser(u.id, email)
      await claimAdminIfFirst(email)
      return html(claimPage({ ...common, step: "done", email }), 200, await browserLogin(email, secure))
    }

    if (path.startsWith("/account")) {
      if (path === "/account/logout" && req.method === "POST") return redirect("/", { "set-cookie": "mc_web=; Path=/; Max-Age=0" })
      if (path === "/account/start" && req.method === "POST") {
        const e = ((await form(req)).email ?? "").trim().toLowerCase()
        if (!validEmail(e)) return html(signInPage("Enter a valid email.", e), 400)
        if (!(await mail())) return html(signInPage("Email sign-in is not enabled on this server yet. Open an approval link from `mc whoami` instead.", e), 400)
        await issueOtp(e, base)
        return html(signInPage(undefined, e, true))
      }
      if (path === "/account/verify" && req.method === "POST") {
        const b = await form(req)
        const e = (b.email ?? "").trim().toLowerCase()
        if (!(await checkOtp(e, b.otp ?? ""))) return html(signInPage("Wrong or expired code.", e, true), 400)
        return redirect("/account", await browserLogin(e, secure))
      }
      const email = await browserUser(req)
      if (!email) return html(signInPage())
      const machines = await store.machinesByEmail(email)
      const sessions = await Promise.all((await store.sessionsByEmail(email)).map(async (s) => ({ ...(await withMeta(s, true)), share_key: s.share_key })))
      return html(accountPage({ email, machines, sessions, host: base, admin: await isAdmin(email) }))
    }

    // ---- admin: mail provider, editable from the browser (admin = first approved email) or via mc admin ----
    const user = await auth(req, url)
    const shareKey = req.headers.get("x-share-key") ?? url.searchParams.get("key")
    if (path.startsWith("/admin")) {
      const email = (await browserUser(req)) ?? (user?.claimed_at ? (user.email ?? null) : null)
      if (!(await isAdmin(email))) {
        const anyAdmin = await store.getSetting("admin_email")
        const msg = anyAdmin ? `admin only — sign in as ${anyAdmin.replace(/(.).*(@.*)/, "$1…$2")}, the first approved email` : "no admin yet — the first person to approve a machine becomes admin"
        return req.headers.has("authorization") || (req.headers.get("accept") ?? "").includes("json") ? err(msg, 403) : html(signInPage(msg[0].toUpperCase() + msg.slice(1) + "."), 403)
      }
      const cur = await mail()
      if (path === "/admin" && req.method === "GET") return html(adminPage({ host: base, cfg: cur, email: email! }))
      if (path === "/admin/mail" && req.method === "POST") {
        const isJson = (req.headers.get("content-type") ?? "").includes("json")
        const b = isJson ? ((await req.json()) as Record<string, string>) : await form(req)
        try {
          if (b.action === "clear") {
            await store.setSetting("mail", null)
            return isJson ? json({ ok: true, cleared: true }) : redirect("/admin?ok=cleared")
          }
          const cfg = parseMailForm(b)
          await sendMail(cfg, email!, "multiclaude: email is configured", `This is the test message from ${base}.\n\nProvider: ${cfg.provider}\nFrom: ${cfg.from}\n\nCodes for approving machines will now be emailed.`)
          await store.setSetting("mail", JSON.stringify(cfg))
          return isJson ? json({ ok: true, provider: cfg.provider, from: cfg.from, test_sent_to: email }) : redirect("/admin?ok=saved")
        } catch (e) {
          const msg = (e as Error).message
          return isJson ? err(msg, 400) : html(adminPage({ host: base, cfg: cur, email: email!, error: msg, values: b }), 400)
        }
      }
      if (path === "/admin/status") return json({ admin: email, mail: cur ? { provider: cur.provider, from: cur.from } : null })
      return err("not found", 404)
    }

    // ---- API ----

    if (path === "/auth/register" && req.method === "POST") {
      const body = (await req.json().catch(() => ({}))) as { name?: string }
      const name = (body.name ?? "").trim()
      if (!name) return err("name required", 400)
      const id = rid()
      const token = "mc_" + crypto.randomUUID().replace(/-/g, "")
      const claimCode = crypto.randomUUID().replace(/-/g, "")
      await store.createUser({ id, name, token, claimCode })
      return json({ token, user: name, claim_url: `${base}/claim/${claimCode}` })
    }
    if (path === "/me")
      return user
        ? json({ user: user.name, id: user.id, email: user.email ?? null, claimed: !!user.claimed_at, claim_url: user.claimed_at ? null : `${base}/claim/${user.claim_code}` })
        : err("unauthorized", 401)

    if (path === "/sessions" && req.method === "GET") {
      if (!user) return err("unauthorized", 401)
      return json(await Promise.all((await store.sessionsFor(user.id, shareKey)).map((s) => withMeta(s, true))))
    }
    if (path === "/sessions" && req.method === "POST") {
      if (!user) return err("unauthorized", 401)
      const body = (await req.json().catch(() => ({}))) as { id?: string; name?: string; adapter?: string; share_key?: string; forked_from?: string }
      const id = body.id ?? rid()
      const existing = await store.session(id)
      if (existing) {
        if (!(await canAccess(existing, user, shareKey))) return err("session id taken", 409)
        return json(await withMeta(existing, true))
      }
      await store.createSession({ id, name: body.name ?? null, owner: user.id, adapter: body.adapter ?? "claude", shareKey: body.share_key?.trim() || key(), forkedFrom: body.forked_from ?? null })
      return json(await withMeta((await store.session(id))!, true), 201)
    }

    const m = path.match(/^\/sessions\/([^/]+)(?:\/(\w+))?$/)
    if (!m) return err("not found", 404)
    const s = await store.session(m[1])
    if (!s) return err("session not found", 404)
    const sub = m[2]

    if (sub === "join" && req.method === "POST") {
      if (!user) return err("unauthorized", 401)
      if (!(await canAccess(s, user, shareKey))) return err("bad share key", 403)
      await store.addMember(s.id, user.id)
      return json(await withMeta(s, true))
    }
    if (!(await canAccess(s, user, shareKey))) return err("forbidden", 403)
    const isOwner = user?.id === s.owner

    if (sub === "ws") {
      if (!user) return err("unauthorized (ws needs token)", 401)
      const r = opts.upgrade?.(req, { sessionId: s.id, user })
      return r ?? err("websocket not available on this host; use long polling (?wait=)", 501)
    }
    if (!sub && req.method === "GET") return json(await withMeta(s, isOwner || !!shareKey))
    if (sub === "have" && req.method === "POST") {
      const body = (await req.json()) as { ids: string[] }
      const have = await store.existingIds(s.id, body.ids ?? [])
      return json({ missing: (body.ids ?? []).filter((id) => !have.has(id)) })
    }
    if (sub === "entries" && req.method === "GET") {
      const after = Number(url.searchParams.get("after") ?? 0)
      // long poll: hold the request until something new arrives or `wait` seconds pass
      const wait = Math.min(Number(url.searchParams.get("wait") ?? 0), 50)
      const deadline = Date.now() + wait * 1000
      let entries = await store.entriesAfter(s.id, after)
      while (!entries.length && Date.now() < deadline) {
        await sleep(1000)
        entries = await store.entriesAfter(s.id, after)
      }
      return json({ entries, head: (await store.head(s.id)).head })
    }
    if (sub === "entries" && req.method === "POST") {
      if (!user) return err("unauthorized (push needs token)", 401)
      const body = (await req.json()) as { entries: WireEntry[] }
      const added = await addEntries(s.id, user, body.entries ?? [])
      return json({ added: added.length, head: (await store.head(s.id)).head })
    }
    return err("not found", 404)
  }

  return { fetch, addEntries, store }
}

import type { WireEntry } from "./transcript"

export interface RemoteSession {
  id: string
  name: string | null
  owner: string
  adapter: string
  share_key?: string
  head: number
  entries: number
  created_at: string
  updated_at: string
}

export class Client {
  constructor(
    public base: string,
    public token?: string,
  ) {
    this.base = base.replace(/\/$/, "")
  }

  private async req<T>(method: string, path: string, body?: unknown, key?: string): Promise<T> {
    const headers: Record<string, string> = { "content-type": "application/json" }
    if (this.token) headers.authorization = `Bearer ${this.token}`
    if (key) headers["x-share-key"] = key
    const res = await fetch(this.base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`${method} ${path} → ${res.status}: ${text}`)
    }
    return (await res.json()) as T
  }

  register(name: string) {
    return this.req<{ token: string; user: string }>("POST", "/auth/register", { name })
  }
  me() {
    return this.req<{ user: string }>("GET", "/me")
  }
  listSessions(shareKey?: string) {
    return this.req<RemoteSession[]>("GET", "/sessions", undefined, shareKey)
  }
  createSession(id: string, name: string | undefined, adapter: string, shareKey?: string) {
    return this.req<RemoteSession>("POST", "/sessions", { id, name, adapter, share_key: shareKey }, shareKey)
  }
  getSession(id: string, key?: string) {
    return this.req<RemoteSession>("GET", `/sessions/${id}`, undefined, key)
  }
  join(id: string, key: string) {
    return this.req<RemoteSession>("POST", `/sessions/${id}/join`, {}, key)
  }
  have(id: string, ids: string[]) {
    return this.req<{ missing: string[] }>("POST", `/sessions/${id}/have`, { ids })
  }
  pushEntries(id: string, entries: WireEntry[]) {
    return this.req<{ added: number; head: number }>("POST", `/sessions/${id}/entries`, { entries })
  }
  pullEntries(id: string, after: number) {
    return this.req<{ entries: WireEntry[]; head: number }>("GET", `/sessions/${id}/entries?after=${after}`)
  }
  wsUrl(id: string, after: number) {
    const u = new URL(this.base)
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:"
    u.pathname = `/sessions/${id}/ws`
    u.searchParams.set("after", String(after))
    if (this.token) u.searchParams.set("token", this.token)
    return u.toString()
  }
}

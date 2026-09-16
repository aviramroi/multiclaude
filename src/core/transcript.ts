// A transcript is append-only JSONL. Entries with `uuid`/`parentUuid` form a DAG
// (user → assistant → user …); metadata lines (queue-operation, last-prompt …)
// carry no uuid and are addressed by a content hash instead.
export interface Entry {
  id: string
  parent: string | null
  type: string
  ts: string | null
  raw: string
}

export interface WireEntry extends Entry {
  seq?: number
  author?: string
}

export function hashLine(line: string): string {
  const h = new Bun.CryptoHasher("sha256")
  h.update(line)
  return "h_" + h.digest("hex").slice(0, 32)
}

export function parseLine(line: string): Entry | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  let obj: any
  try {
    obj = JSON.parse(trimmed)
  } catch {
    return null
  }
  return {
    id: typeof obj.uuid === "string" ? obj.uuid : hashLine(trimmed),
    parent: typeof obj.parentUuid === "string" ? obj.parentUuid : null,
    type: typeof obj.type === "string" ? obj.type : "unknown",
    ts: typeof obj.timestamp === "string" ? obj.timestamp : null,
    raw: trimmed,
  }
}

export async function readTranscript(path: string): Promise<Entry[]> {
  const f = Bun.file(path)
  if (!(await f.exists())) return []
  const text = await f.text()
  const out: Entry[] = []
  for (const line of text.split("\n")) {
    const e = parseLine(line)
    if (e) out.push(e)
  }
  return out
}

export async function appendLines(path: string, lines: string[]): Promise<void> {
  if (!lines.length) return
  const f = Bun.file(path)
  const existing = (await f.exists()) ? await f.text() : ""
  const sep = existing.length && !existing.endsWith("\n") ? "\n" : ""
  await Bun.write(path, existing + sep + lines.join("\n") + "\n")
}

/** DAG leaves among conversational entries. >1 leaf means the session diverged. */
export function leaves(entries: Entry[]): Entry[] {
  // Attachments/system lines hang off the same chain, so a leaf is any uuid-bearing
  // entry (not a hashed metadata line) with no child of any type.
  const hasChild = new Set(entries.map((e) => e.parent).filter(Boolean) as string[])
  return entries.filter((e) => !e.id.startsWith("h_") && (e.parent !== null || e.type === "user") && !hasChild.has(e.id))
}

/** Rewrite machine-specific fields so a pulled transcript resumes on this machine. */
export function localize(raw: string, cwd: string, sessionId: string): string {
  try {
    const obj = JSON.parse(raw)
    // Claude Code: top-level fields on every line
    if ("cwd" in obj) obj.cwd = cwd
    if ("sessionId" in obj) obj.sessionId = sessionId
    // Codex: only the session_meta line carries them
    if (obj.type === "session_meta" && obj.payload) {
      obj.payload.cwd = cwd
      obj.payload.id = sessionId
      obj.payload.session_id = sessionId
    }
    return JSON.stringify(obj)
  } catch {
    return raw
  }
}

/** Human-readable one-liner for a transcript entry (null for noise). */
export function summarize(raw: string, max = 160): { role: string; text: string } | null {
  let obj: any
  try {
    obj = JSON.parse(raw)
  } catch {
    return null
  }
  if (obj.type === "response_item") return summarizeCodex(obj, max)
  if (obj.type !== "user" && obj.type !== "assistant") return null
  const m = obj.message ?? {}
  const parts: string[] = []
  const content = m.content
  if (typeof content === "string") parts.push(content)
  else if (Array.isArray(content)) {
    for (const c of content) {
      if (c.type === "text") parts.push(c.text)
      else if (c.type === "tool_use") parts.push(`⚙ ${c.name}(${JSON.stringify(c.input).slice(0, 80)})`)
      else if (c.type === "tool_result") {
        const t = typeof c.content === "string" ? c.content : JSON.stringify(c.content)
        parts.push(`↳ ${String(t).slice(0, 80)}`)
      }
    }
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim()
  if (!text) return null
  return { role: obj.type, text: text.length > max ? text.slice(0, max) + "…" : text }
}

function summarizeCodex(obj: any, max: number): { role: string; text: string } | null {
  const p = obj.payload ?? {}
  const parts: string[] = []
  let role = "assistant"
  if (p.type === "message") {
    if (p.role === "developer" || p.role === "system") return null
    role = p.role === "user" ? "user" : "assistant"
    for (const c of p.content ?? []) if (c.type === "input_text" || c.type === "output_text") parts.push(c.text)
    // Codex injects environment context (<recommended_plugins>, <environment_context>…) as user turns
    if (role === "user" && /^\s*<[a-z_]+>/.test(parts.join(""))) return null
  } else if (p.type === "function_call" || p.type === "custom_tool_call") {
    parts.push(`⚙ ${p.name}(${String(p.arguments ?? p.input ?? "").slice(0, 80)})`)
  } else return null
  const text = parts.join(" ").replace(/\s+/g, " ").trim()
  // Codex wraps user turns in tags; strip the noise
  const clean = text.replace(/<\/?[a-z_]+>/g, "").trim()
  if (!clean) return null
  return { role, text: clean.length > max ? clean.slice(0, max) + "…" : clean }
}

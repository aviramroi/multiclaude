import { describe, expect, test } from "bun:test"
import { hashLine, leaves, localize, parseLine, summarize } from "../src/core/transcript"

const u = (id: string, parent: string | null, text: string, type = "user") =>
  JSON.stringify({ uuid: id, parentUuid: parent, type, message: { role: type, content: text }, cwd: "/a", sessionId: "s" })

describe("transcript", () => {
  test("uuid lines keep their id, metadata lines get a stable hash", () => {
    expect(parseLine(u("x", null, "hi"))!.id).toBe("x")
    const meta = '{"type":"queue-operation","operation":"enqueue"}'
    expect(parseLine(meta)!.id).toBe(hashLine(meta))
    expect(parseLine(meta)!.id).toBe(parseLine(meta)!.id)
    expect(parseLine("")).toBeNull()
    expect(parseLine("not json")).toBeNull()
  })
  test("leaves detects divergence", () => {
    const lin = [u("1", null, "a"), u("2", "1", "b", "assistant")].map((l) => parseLine(l)!)
    expect(leaves(lin).map((e) => e.id)).toEqual(["2"])
    const forked = [...lin, u("3", "2", "c"), u("4", "2", "d")].map((l) => (typeof l === "string" ? parseLine(l)! : l))
    expect(leaves(forked).length).toBe(2)
  })
  test("localize rewrites cwd + sessionId only", () => {
    const o = JSON.parse(localize(u("1", null, "a"), "/b", "t"))
    expect(o.cwd).toBe("/b")
    expect(o.sessionId).toBe("t")
    expect(o.message.content).toBe("a")
  })
  test("summarize flattens content blocks", () => {
    const raw = JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "yo" }, { type: "tool_use", name: "Bash", input: { command: "ls" } }] } })
    expect(summarize(raw)!.text).toContain("yo")
    expect(summarize(raw)!.text).toContain("⚙ Bash")
    expect(summarize('{"type":"attachment"}')).toBeNull()
  })
})

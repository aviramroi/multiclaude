// Minimal SMTP sink for tests: accepts any mail, appends "TO <addr>\n<body>\n---\n" to $SINK_FILE.
const out = process.env.SINK_FILE ?? "sink.txt"
Bun.listen({
  hostname: "127.0.0.1",
  port: Number(process.env.SINK_PORT ?? 2525),
  socket: {
    open(s) { s.write("220 sink ready\r\n"); (s as any).data = { buf: "", inData: false, to: "" } },
    data(s, chunk) {
      const st = (s as any).data
      st.buf += Buffer.from(chunk).toString()
      let i
      while ((i = st.buf.indexOf("\r\n")) >= 0) {
        const line = st.buf.slice(0, i); st.buf = st.buf.slice(i + 2)
        if (st.inData) {
          if (line === ".") { st.inData = false; Bun.write(out, (require("fs").existsSync(out) ? require("fs").readFileSync(out, "utf8") : "") + `TO ${st.to}\n${st.body}\n---\n`); s.write("250 ok\r\n") }
          else st.body += line + "\n"
          continue
        }
        const u = line.toUpperCase()
        if (u.startsWith("EHLO") || u.startsWith("HELO")) s.write("250-sink\r\n250 AUTH PLAIN LOGIN\r\n")
        else if (u.startsWith("AUTH LOGIN")) { s.write("334 VXNlcm5hbWU6\r\n"); st.auth = 1 }
        else if (st.auth === 1) { s.write("334 UGFzc3dvcmQ6\r\n"); st.auth = 2 }
        else if (st.auth === 2) { s.write("235 ok\r\n"); st.auth = 0 }
        else if (u.startsWith("AUTH PLAIN")) s.write("235 ok\r\n")
        else if (u.startsWith("RCPT TO")) { st.to = line.replace(/.*<(.*)>.*/, "$1"); s.write("250 ok\r\n") }
        else if (u.startsWith("DATA")) { st.inData = true; st.body = ""; s.write("354 go\r\n") }
        else if (u.startsWith("QUIT")) { s.write("221 bye\r\n"); s.end() }
        else s.write("250 ok\r\n")
      }
    },
  },
})
console.log("smtp sink on", process.env.SINK_PORT ?? 2525)

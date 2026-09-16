// Server-rendered pages: landing, claim flow, account. No build step; one shared stylesheet.
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const CSS = `
:root{--bg:#0b0d10;--fg:#e8e6e1;--mut:#8a8f98;--acc:#f5c451;--acc2:#7dd3fc;--card:#12151a;--line:#1f242b;--ok:#4ade80}
@media(prefers-color-scheme:light){:root{--bg:#faf9f6;--fg:#15171a;--mut:#5c6370;--acc:#b8860b;--acc2:#0369a1;--card:#fff;--line:#e6e3dc}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif}
a{color:var(--acc2);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:860px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;padding:20px 0;border-bottom:1px solid var(--line)}
.logo{font-weight:700;letter-spacing:-.02em}.logo b{color:var(--acc)}
nav a{margin-left:18px;color:var(--mut);font-size:14px}
h1{font-size:clamp(34px,6vw,56px);line-height:1.05;letter-spacing:-.03em;margin:64px 0 18px}
h1 em{font-style:normal;color:var(--acc)}
.lead{font-size:19px;color:var(--mut);max-width:620px}
h2{font-size:22px;margin:56px 0 12px;letter-spacing:-.01em}
pre{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px;overflow:auto;font:14px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
pre.wrap{white-space:pre-wrap;word-break:break-word;padding-right:70px}
pre .c{color:var(--mut)}pre .k{color:var(--acc)}pre .p{color:var(--acc2)}
code{font:.92em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;margin-top:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px}
.card h3{margin:0 0 6px;font-size:16px}.card p{margin:0;color:var(--mut);font-size:15px}
.steps{counter-reset:s;padding:0;margin:18px 0 0;list-style:none}
.steps li{counter-increment:s;position:relative;padding:0 0 18px 44px;color:var(--mut)}
.steps li b{color:var(--fg)}
.steps li:before{content:counter(s);position:absolute;left:0;top:0;width:28px;height:28px;border-radius:50%;background:var(--card);border:1px solid var(--line);display:grid;place-items:center;font-size:13px;color:var(--acc)}
.btn{display:inline-block;background:var(--acc);color:#111;font-weight:600;border:0;border-radius:9px;padding:12px 18px;cursor:pointer;font-size:15px}
.btn.sec{background:transparent;color:var(--fg);border:1px solid var(--line)}
input{width:100%;font:16px inherit;padding:12px 14px;border-radius:9px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
label{display:block;font-size:14px;color:var(--mut);margin:14px 0 6px}
.box{max-width:480px;margin:64px auto;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:28px}
.box h1{font-size:26px;margin:0 0 8px}.box p{color:var(--mut)}
.kv{display:grid;grid-template-columns:120px 1fr;gap:6px 14px;font-size:14px;margin:16px 0}.kv dt{color:var(--mut)}.kv dd{margin:0;word-break:break-all}
.ok{color:var(--ok)}.warn{color:var(--acc)}
table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500}
footer{margin:80px 0 40px;color:var(--mut);font-size:14px;border-top:1px solid var(--line);padding-top:20px}
.copy{float:right;font-size:12px;color:var(--mut);cursor:pointer;border:1px solid var(--line);border-radius:6px;padding:2px 8px;background:transparent}
`

const page = (title: string, body: string, desc = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="26">⇅</text></svg>')}">
<style>${CSS}</style></head><body><div class="wrap">
<header><a class="logo" href="/">multi<b>claude</b></a><nav><a href="/#how">How it works</a><a href="/#install">Install</a><a href="https://github.com/aviramroi/multiclaude">GitHub</a><a href="/account">Account</a></nav></header>
${body}
<footer>multiclaude — open source (MIT), <a href="https://github.com/aviramroi/multiclaude">github.com/aviramroi/multiclaude</a>. Hosted for free at this address; self-host with one <code>bun run server</code>.</footer>
</div><script>document.querySelectorAll('.copy').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.parentElement.innerText.replace('copy','').trim());b.textContent='copied';setTimeout(()=>b.textContent='copy',1200)})</script></body></html>`

export function landing(host: string) {
  const agentPrompt = `Set up multiclaude on this machine: run \`curl -fsSL ${host}/install.sh | bash\` and then \`mc login ${host}\`. Send me the approval link it prints and stop.`
  return page(
    "multiclaude — share Claude Code & Codex sessions like git",
    `
<h1>Push, pull and <em>co-drive</em> your coding-agent sessions.</h1>
<p class="lead">multiclaude treats a Claude Code or Codex conversation like a git repo. Hand a session to a teammate on another account, pull their turns back, or stream both ways live — with hooks doing the work, zero extra tokens.</p>
<p style="margin-top:26px"><a class="btn" href="#install">Set up with your agent</a> &nbsp; <a class="btn sec" href="https://github.com/aviramroi/multiclaude">Read the source</a></p>

<h2 id="how">How it works</h2>
<div class="grid">
 <div class="card"><h3>Transcripts are DAGs</h3><p>Every turn has a uuid and a parent. Sync is a set-union of lines — idempotent, mergeable, no lost work.</p></div>
 <div class="card"><h3>Hooks, not prompts</h3><p>SessionStart / Stop hooks call <code>mc hook</code>. Your agent never spends a turn on sync.</p></div>
 <div class="card"><h3>Two modes</h3><p><b>Turn-based</b>: push → clone → resume → push back. <b>Live</b>: both sides stream every line in real time.</p></div>
 <div class="card"><h3>Any account, any machine</h3><p>Transcripts hold no credentials. Paths are rewritten on pull; <code>claude --resume</code> just works.</p></div>
</div>

<h2 id="install">Let your agent set it up — you only approve</h2>
<p class="lead" style="font-size:16px">Paste this into Claude Code or Codex. The agent downloads one small binary (no git, no runtimes, no config files), registers this machine, and hands you one link. Nothing is created until you approve it.</p>
<pre class="wrap"><button class="copy">copy</button>${esc(agentPrompt)}</pre>
<ol class="steps">
 <li><b>Agent installs and registers.</b> It gets a working token immediately and prints an approval link.</li>
 <li><b>You open the link, enter your email, type the 6-digit code.</b> That's the whole signup.</li>
 <li><b>Share a project.</b> Tell your agent “share this project with multiclaude” — it runs <code>mc init</code> and gives you an invite link.</li>
 <li><b>Teammate pastes the link to their agent.</b> Their agent runs <code>mc join &lt;link&gt;</code>; from then on every session in that folder syncs both ways. No git involved.</li>
</ol>

<h2>Or do it by hand</h2>
<pre><span class="c"># install: one static binary into ~/.multiclaude/bin, hooks wired for Claude Code / Codex</span>
curl -fsSL ${esc(host)}/install.sh | bash
mc login ${esc(host)}                 <span class="c"># prints the approval link</span>

<span class="c"># share a project (you)</span>
cd ~/proj && mc init                  <span class="c"># prints an invite link like ${esc(host)}/j/…</span>
claude                                <span class="c"># or: codex — sessions here now sync via hooks</span>

<span class="c"># join it (teammate, any account, any machine)</span>
cd ~/proj && mc join ${esc(host)}/j/&lt;key&gt;
mc ls && mc open &lt;name&gt;             <span class="c"># pull → resume → push on exit</span></pre>

<h2>Self-host</h2>
<pre>git clone https://github.com/aviramroi/multiclaude && cd multiclaude && bun install
PORT=4747 bun run server              <span class="c"># SQLite file, one process; or: docker build .</span></pre>
`,
    "git-style push/pull and live multiplayer for Claude Code and Codex sessions across accounts.",
  )
}

export function claimPage(opts: { code: string; user: string; created: string; claimed?: string | null; step: "email" | "code" | "done"; email?: string; error?: string; host: string }) {
  const { code, user, created, step, email, error } = opts
  let body: string
  if (opts.claimed) {
    body = `<h1>Already approved</h1><p>This machine (<b>${esc(user)}</b>) is linked to <b>${esc(opts.claimed)}</b>.</p><p><a class="btn" href="/account">Open account</a></p>`
  } else if (step === "email") {
    body = `<h1>Approve this machine?</h1>
<p>An agent running as <b>${esc(user)}</b> asked to create a multiclaude account on ${esc(opts.host)} (${esc(created)}).</p>
<dl class="kv"><dt>Machine</dt><dd>${esc(user)}</dd><dt>Can do</dt><dd>push &amp; pull sessions it has share keys for</dd><dt>Cannot do</dt><dd>read other people's sessions, change your email, delete anything</dd></dl>
<form method="post" action="/claim/${esc(code)}/start"><label>Your email — we send a 6-digit code</label><input name="email" type="email" required autofocus placeholder="you@company.com" value="${esc(email)}">
${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn">Send code</button></p></form>`
  } else if (step === "code") {
    body = `<h1>Enter the code</h1><p>Sent to <b>${esc(email)}</b>. It expires in 10 minutes.</p>
<form method="post" action="/claim/${esc(code)}/verify"><input type="hidden" name="email" value="${esc(email)}"><label>6-digit code</label><input name="otp" inputmode="numeric" pattern="[0-9]{6}" required autofocus placeholder="123456">
${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn">Approve machine</button> &nbsp; <a href="/claim/${esc(code)}">change email</a></p></form>`
  } else {
    body = `<h1 class="ok">Approved</h1><p><b>${esc(user)}</b> is now linked to <b>${esc(email)}</b>. Your agent can keep working — nothing else to do.</p><p><a class="btn" href="/account">Open account</a></p>`
  }
  return page("Approve machine — multiclaude", `<div class="box">${body}</div>`)
}

export function accountPage(opts: { email: string; machines: { name: string; created_at: string }[]; sessions: { id: string; name: string | null; adapter: string; entries: number; updated_at: string; share_key: string }[]; host: string }) {
  const rows = opts.sessions
    .map((s) => `<tr><td><code>${esc(s.id.slice(0, 8))}</code> ${esc(s.name ?? "")}</td><td>${esc(s.adapter)}</td><td>${s.entries}</td><td>${esc(s.updated_at.slice(0, 16))}</td><td><code style="font-size:12px">mc clone ${esc(opts.host)}/sessions/${esc(s.id)}?key=${esc(s.share_key)}</code></td></tr>`)
    .join("")
  return page(
    "Account — multiclaude",
    `<h2 style="margin-top:40px">${esc(opts.email)}</h2>
<p class="lead" style="font-size:15px">Machines: ${opts.machines.map((m) => `<code>${esc(m.name)}</code>`).join(" ") || "none"}</p>
<h2>Sessions</h2>
${rows ? `<table><tr><th>Session</th><th>Agent</th><th>Entries</th><th>Updated</th><th>Share</th></tr>${rows}</table>` : `<p class="lead" style="font-size:15px">No sessions yet. Run <code>mc init</code> in a project and start Claude or Codex.</p>`}
<form method="post" action="/account/logout" style="margin-top:40px"><button class="btn sec">Sign out</button></form>`,
  )
}

export function signInPage(error?: string, email?: string, sent = false) {
  const body = sent
    ? `<h1>Enter the code</h1><p>Sent to <b>${esc(email)}</b>.</p><form method="post" action="/account/verify"><input type="hidden" name="email" value="${esc(email)}"><label>6-digit code</label><input name="otp" inputmode="numeric" pattern="[0-9]{6}" required autofocus>${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn">Sign in</button></p></form>`
    : `<h1>Sign in</h1><p>We email you a code — no password.</p><form method="post" action="/account/start"><label>Email</label><input name="email" type="email" required autofocus value="${esc(email)}">${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn">Send code</button></p></form>`
  return page("Sign in — multiclaude", `<div class="box">${body}</div>`)
}

export function joinPage(opts: { host: string; key: string; mode: "turn" | "live"; sessions: number }) {
  const link = `${opts.host}/j/${opts.key}${opts.mode === "live" ? "?mode=live" : ""}`
  const prompt = `Join a shared multiclaude project in this folder: if \`mc\` is missing run \`curl -fsSL ${opts.host}/install.sh | bash\` and \`mc login ${opts.host}\`; then run \`mc join ${link}\`, show me \`mc ls\`, and stop.`
  return page(
    "Join project — multiclaude",
    `<div class="box"><h1>You've been invited to a shared project</h1>
<p>${opts.sessions} session${opts.sessions === 1 ? "" : "s"} so far · ${opts.mode === "live" ? "live" : "turn-based"} mode.</p>
<p>Open Claude Code or Codex <b>in the project folder</b> and paste:</p>
<pre class="wrap"><button class="copy">copy</button>${esc(prompt)}</pre>
<p style="font-size:14px">Or by hand: <code>mc join ${esc(link)}</code></p></div>`,
  )
}

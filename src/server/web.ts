// Server-rendered pages. Written for people who don't use a terminal: one thing to copy, one button to press.
// Everything technical lives behind "For developers" or on /agent (instructions the AI reads).
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const CSS = `
:root{--bg:#fbfaf7;--fg:#1a1c20;--mut:#666b75;--acc:#e0a52c;--acc-ink:#1a1c20;--acc2:#0b6bcb;--card:#fff;--line:#e8e4dc;--ok:#1a9a5a;--warn:#b45309}
@media(prefers-color-scheme:dark){:root{--bg:#0e1013;--fg:#ecebe7;--mut:#9aa0aa;--acc:#f3c04f;--acc2:#7dc4ff;--card:#161a20;--line:#252b34;--ok:#4ade80;--warn:#fbbf24}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font:17px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Inter,sans-serif}
a{color:var(--acc2);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:720px;margin:0 auto;padding:0 16px}
header{display:flex;justify-content:space-between;align-items:center;padding:18px 0}
.logo{font-weight:700;letter-spacing:-.02em;color:var(--fg)}.logo b{color:var(--acc)}
nav a{margin-left:16px;color:var(--mut);font-size:15px}
h1{font-size:clamp(32px,7vw,52px);line-height:1.08;letter-spacing:-.03em;margin:56px 0 16px}
h1 em{font-style:normal;color:var(--acc)}
.lead{font-size:20px;color:var(--mut);max-width:560px;margin:0 0 28px}
h2{font-size:24px;margin:56px 0 10px;letter-spacing:-.01em}
h3{font-size:17px;margin:0 0 4px}
p{margin:0 0 12px}
.copybox{position:relative;background:var(--card);border:2px solid var(--acc);border-radius:16px;padding:20px 20px 62px;font-size:18px;line-height:1.5;box-shadow:0 8px 30px rgba(0,0,0,.06)}
.copybox .copy{position:absolute;right:14px;bottom:14px;background:var(--acc);color:var(--acc-ink);font-weight:700;border:0;border-radius:10px;padding:11px 18px;font-size:15px;cursor:pointer}
.copybox .copy:active{transform:translateY(1px)}
.hint{color:var(--mut);font-size:15px;margin-top:10px}
.steps{padding:0;margin:14px 0 0;list-style:none;counter-reset:s}
.steps li{counter-increment:s;position:relative;padding:0 0 22px 50px;font-size:17px}
.steps li b{display:block;color:var(--fg)}.steps li span{color:var(--mut)}
.steps li:before{content:counter(s);position:absolute;left:0;top:0;width:34px;height:34px;border-radius:50%;background:var(--acc);color:var(--acc-ink);display:grid;place-items:center;font-weight:700}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px;margin-top:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}
.card p{margin:0;color:var(--mut);font-size:15px}
.btn{display:inline-block;background:var(--acc);color:var(--acc-ink);font-weight:700;border:0;border-radius:12px;padding:14px 22px;cursor:pointer;font-size:17px;text-decoration:none!important}
.btn.sec{background:transparent;color:var(--fg);border:1px solid var(--line)}
.btn.block{display:block;width:100%;text-align:center}
input{width:100%;font:18px inherit;padding:14px 16px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)}
label{display:block;font-size:15px;color:var(--mut);margin:16px 0 6px}
.box{max-width:480px;margin:48px auto;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:28px}
.box h1{font-size:28px;margin:0 0 10px}.box .lead{font-size:17px;margin-bottom:6px}
.ok{color:var(--ok)}.warn{color:var(--warn)}
details{margin-top:56px;border-top:1px solid var(--line);padding-top:18px}
summary{cursor:pointer;color:var(--mut);font-size:15px}
pre{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;overflow:auto;font:13.5px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace}
pre .c{color:var(--mut)}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--card);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
.row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 0;border-bottom:1px solid var(--line)}
.row .t{font-weight:600}.row .s{color:var(--mut);font-size:14px}
.mini{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 12px;font-size:14px;cursor:pointer;color:var(--fg);white-space:nowrap}
footer{margin:64px 0 40px;color:var(--mut);font-size:14px}
`

const COPY_JS = `document.querySelectorAll('[data-copy]').forEach(b=>b.onclick=()=>{navigator.clipboard.writeText(b.getAttribute('data-copy'));const t=b.textContent;b.textContent='Copied ✓';setTimeout(()=>b.textContent=t,1500)})`

const page = (title: string, body: string, desc = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="26" font-size="26">🤝</text></svg>')}">
<style>${CSS}</style></head><body><div class="wrap">
<header><a class="logo" href="/">multi<b>claude</b></a><nav><a href="/#how">How it works</a><a href="/account">My sessions</a></nav></header>
${body}
<footer>Free and open source · <a href="https://github.com/aviramroi/multiclaude">GitHub</a> · <a href="/agent">Instructions for AI agents</a></footer>
</div><script>${COPY_JS}</script></body></html>`

/** The one sentence a person pastes into their AI. The AI reads /agent for the real steps. */
export const setupPrompt = (host: string) => `Please set up multiclaude for me by following the instructions at ${host}/agent — then give me the approval link and stop.`
export const invitePrompt = (host: string, key: string, mode: "turn" | "live") =>
  `Please join my teammate's multiclaude project in this folder by following the instructions at ${host}/j/${key}/agent${mode === "live" ? "?mode=live" : ""} — then tell me which sessions are available and stop.`

export function landing(host: string) {
  const prompt = setupPrompt(host)
  return page(
    "multiclaude — share your AI coding session with a teammate",
    `
<h1>Work on the same AI session, <em>together</em>.</h1>
<p class="lead">Share a Claude Code or Codex session with a teammate — like sharing a Google Doc. They pick up exactly where you left off, on their own computer and account.</p>

<h2 style="margin-top:0">Set it up in one paste</h2>
<p class="hint" style="margin:0 0 12px">Copy this and paste it into Claude Code or Codex. Your AI does the setup; you only click <b>Approve</b>.</p>
<div class="copybox">${esc(prompt)}<button class="copy" data-copy="${esc(prompt)}">Copy</button></div>

<h2 id="how">How it works</h2>
<ol class="steps">
 <li><b>Paste the sentence above into your AI.</b><span>It sets itself up and gives you back a link.</span></li>
 <li><b>Open the link and tap Approve.</b><span>That's your account. No password, no forms.</span></li>
 <li><b>Tell your AI “share this project”.</b><span>You get an invite link to send to a teammate.</span></li>
 <li><b>Your teammate pastes the invite into their AI.</b><span>From now on you both see the same sessions.</span></li>
</ol>

<h2>What you get</h2>
<div class="cards">
 <div class="card"><h3>Hand off, don't re-explain</h3><p>Your teammate's AI already knows everything yours figured out.</p></div>
 <div class="card"><h3>Works across accounts</h3><p>Different Claude or Codex logins, different computers — doesn't matter.</p></div>
 <div class="card"><h3>Automatic</h3><p>Sessions sync in the background. Nothing to run, nothing to remember.</p></div>
 <div class="card"><h3>Live mode</h3><p>Watch a teammate's session as it happens, or drive it together.</p></div>
</div>

<details><summary>For developers</summary>
<pre><span class="c"># install one static binary + wire the Claude Code / Codex hooks</span>
curl -fsSL ${esc(host)}/install.sh | bash
mc login ${esc(host)}          <span class="c"># prints the approval link</span>

<span class="c"># share the current folder; prints an invite link</span>
mc init                        <span class="c"># or: mc init --mode live</span>

<span class="c"># teammate</span>
mc join ${esc(host)}/j/&lt;key&gt;
mc open &lt;name&gt;               <span class="c"># pull → resume → push on exit</span></pre>
<p class="hint">Sync is done by editor hooks (push on stop, pull on start) — the AI never spends a turn on it. Transcripts are append-only DAGs, so merges are set-unions and nothing is lost. Self-host with <code>bun run server</code>. Source: <a href="https://github.com/aviramroi/multiclaude">github.com/aviramroi/multiclaude</a>.</p>
</details>
`,
    "Share a Claude Code or Codex session with a teammate. Paste one sentence into your AI, click Approve, done.",
  )
}

/** Plain-text instructions an AI agent follows (served at /agent and /j/<key>/agent). */
export function agentInstructions(host: string, join?: { key: string; mode: "turn" | "live" }) {
  const common = `# multiclaude — instructions for AI coding agents

You are setting up multiclaude for the person you are working with. Do these steps yourself; do not ask them to run commands.

1. Install (one static binary, no git/bun/node needed):
   curl -fsSL ${host}/install.sh | bash
   Then make sure it is on PATH for this shell:  export PATH="$HOME/.multiclaude/bin:$PATH"
   (The installer also wires the Claude Code / Codex hooks that sync sessions automatically.)

2. Connect this machine:
   mc login ${host}
   It prints an APPROVAL link (https://…/claim/…).`
  if (join)
    return `${common}

3. Join the shared project — run this INSIDE the project folder they want to share:
   mc join ${host}/j/${join.key}${join.mode === "live" ? "?mode=live" : ""}

4. Show them what is available:
   mc ls
   To continue one of those sessions:  mc open <name-or-id>   (this resumes it in the editor)

5. Tell the person, in plain words: which sessions exist, and give them the approval link from step 2 if the login said it needs approval. Then stop.
`
  return `${common}

3. Tell the person, in plain words: "Open this link and press Approve: <the link>". Then stop.

Later, when they ask to share a project, run inside that folder:
   mc init                # prints an invite link (${host}/j/…) — give it to them to send to a teammate
   mc init --mode live    # same, but both sides stream every turn live
When they paste an invite link, run:  mc join <link>   inside the folder, then  mc ls.
Sessions in a shared folder sync automatically through editor hooks; you never need to run mc push/pull.
`
}

export function claimPage(opts: { code: string; user: string; created: string; claimed?: string | null; step: "email" | "code" | "done"; email?: string; error?: string; host: string; otp?: boolean }) {
  const { code, user, step, email, error } = opts
  let body: string
  if (opts.claimed) {
    body = `<h1 class="ok">Already approved</h1><p class="lead">This computer is connected to <b>${esc(opts.claimed)}</b>.</p><p><a class="btn block" href="/account">See my sessions</a></p>`
  } else if (step === "email") {
    body = `<h1>Your AI wants to connect this computer</h1>
<p class="lead">It's asking to save and share your coding sessions under your name. Nothing happens until you approve.</p>
<p class="hint">Computer: <b>${esc(user)}</b></p>
<form method="post" action="/claim/${esc(code)}/start"><label>Your email — so you can find your sessions later${opts.otp ? " (we'll send a 6-digit code)" : ""}</label><input name="email" type="email" required autofocus placeholder="you@company.com" value="${esc(email)}">
${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn block">${opts.otp ? "Send me the code" : "Approve"}</button></p></form>
<p class="hint">Didn't ask for this? Just close the page.</p>`
  } else if (step === "code") {
    body = `<h1>Check your email</h1><p class="lead">We sent a 6-digit code to <b>${esc(email)}</b>.</p>
<form method="post" action="/claim/${esc(code)}/verify"><input type="hidden" name="email" value="${esc(email)}"><label>Code</label><input name="otp" inputmode="numeric" pattern="[0-9]{6}" required autofocus placeholder="123456">
${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn block">Approve</button></p></form><p class="hint"><a href="/claim/${esc(code)}">Use a different email</a></p>`
  } else {
    body = `<h1 class="ok">You're all set</h1><p class="lead">This computer is now connected to <b>${esc(email)}</b>. You can go back to your AI — it can keep working.</p>
<p class="hint">Next: tell your AI <b>“share this project”</b> and it will give you an invite link for a teammate.</p><p><a class="btn block" href="/account">See my sessions</a></p>`
  }
  return page("Approve — multiclaude", `<div class="box">${body}</div>`)
}

export function accountPage(opts: { email: string; machines: { name: string; created_at: string }[]; sessions: { id: string; name: string | null; adapter: string; entries: number; updated_at: string; share_key: string }[]; host: string }) {
  const rows = opts.sessions
    .map((s) => {
      const invite = invitePrompt(opts.host, s.share_key, "turn")
      const when = new Date(s.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
      return `<div class="row"><div><div class="t">${esc(s.name ?? s.id.slice(0, 8))}</div><div class="s">${esc(s.adapter === "codex" ? "Codex" : "Claude Code")} · ${s.entries} turns · ${esc(when)}</div></div>
<button class="mini" data-copy="${esc(invite)}">Copy invite</button></div>`
    })
    .join("")
  return page(
    "My sessions — multiclaude",
    `<h1 style="font-size:32px;margin-top:40px">My sessions</h1>
<p class="lead">${esc(opts.email)} · ${opts.machines.length} computer${opts.machines.length === 1 ? "" : "s"} connected</p>
${rows || `<p class="lead">No sessions yet. Start Claude Code or Codex in a project and tell it <b>“share this project”</b>.</p>`}
<p class="hint" style="margin-top:18px">“Copy invite” gives you a sentence to send a teammate — they paste it into their AI.</p>
<form method="post" action="/account/logout" style="margin-top:40px"><button class="btn sec">Sign out</button></form>`,
  )
}

export function signInPage(error?: string, email?: string, sent = false) {
  const body = sent
    ? `<h1>Check your email</h1><p class="lead">We sent a 6-digit code to <b>${esc(email)}</b>.</p><form method="post" action="/account/verify"><input type="hidden" name="email" value="${esc(email)}"><label>Code</label><input name="otp" inputmode="numeric" pattern="[0-9]{6}" required autofocus>${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn block">Sign in</button></p></form>`
    : `<h1>See my sessions</h1><p class="lead">Enter the email you approved with. No password.</p><form method="post" action="/account/start"><label>Email</label><input name="email" type="email" required autofocus value="${esc(email)}">${error ? `<p class="warn">${esc(error)}</p>` : ""}<p style="margin-top:18px"><button class="btn block">Continue</button></p></form>`
  return page("Sign in — multiclaude", `<div class="box">${body}</div>`)
}

export function joinPage(opts: { host: string; key: string; mode: "turn" | "live"; sessions: number }) {
  const prompt = invitePrompt(opts.host, opts.key, opts.mode)
  return page(
    "You're invited — multiclaude",
    `<div class="box"><h1>You've been invited to a shared project</h1>
<p class="lead">${opts.sessions ? `${opts.sessions} session${opts.sessions === 1 ? "" : "s"} waiting for you.` : "Your teammate is sharing their AI coding sessions with you."}</p>
<p class="hint">Open Claude Code or Codex <b>in the project folder</b>, then paste this:</p>
<div class="copybox" style="font-size:16px">${esc(prompt)}<button class="copy" data-copy="${esc(prompt)}">Copy</button></div>
<p class="hint">Your AI will set everything up. If it's your first time you'll get one link to approve.</p></div>`,
  )
}

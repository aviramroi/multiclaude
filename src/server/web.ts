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
.pcard{margin:0 0 18px}.pcard .pt{font-weight:700;font-size:17px}.pcard .pw{color:var(--mut);font-size:15px;margin:2px 0 10px}
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

/** Every action a person takes is one exact sentence pasted into their AI; the AI follows /agent/<action>. */
export const prompts = (host: string) => ({
  setup: `Please set up multiclaude for me by following the instructions at ${host}/agent/setup exactly — then give me the approval link and stop.`,
  share: `Please share this project with multiclaude by following the instructions at ${host}/agent/share exactly — then give me the invite sentence for my teammate and stop.`,
  catchup: `Please fetch my teammates' latest multiclaude sessions by following the instructions at ${host}/agent/catchup exactly — then tell me what's new and how to open it, and stop.`,
  live: `Please turn on multiclaude live mode for this project by following the instructions at ${host}/agent/live exactly — then tell me it's on and stop.`,
})
export const setupPrompt = (host: string) => prompts(host).setup
export const invitePrompt = (host: string, key: string, mode: "turn" | "live") =>
  `Please join my teammate's multiclaude project in this folder by following the instructions at ${host}/j/${key}/agent${mode === "live" ? "?mode=live" : ""} exactly — then tell me which session is ready and how to open it, and stop.`

export function landing(host: string) {
  const P = prompts(host)
  const card = (title: string, when: string, text: string) =>
    `<div class="pcard"><div class="pt">${esc(title)}</div><div class="pw">${esc(when)}</div><div class="copybox">${esc(text)}<button class="copy" data-copy="${esc(text)}">Copy</button></div></div>`
  return page(
    "multiclaude — share your AI coding session with a teammate",
    `
<h1>Work on the same AI session, <em>together</em>.</h1>
<p class="lead">Share a Claude Code or Codex session with a teammate — like sharing a Google Doc. They pick up exactly where you left off, on their own computer and account.</p>
<p class="lead" style="font-size:17px">You never type commands. Every step is <b>one sentence you paste into your AI</b>. Your AI does the work; you press Approve.</p>

<h2 style="margin-top:8px">Step 1 — set up (once per computer)</h2>
${card("Set up", "Paste into Claude Code or Codex. It gives you back a link; open it and tap Approve.", P.setup)}

<h2>Step 2 — share a project</h2>
${card("Share this project", "Paste into your AI while it's open in the project. It gives you a sentence to send your teammate.", P.share)}

<h2>Step 3 — your teammate joins</h2>
<p class="hint">They paste the sentence you sent them. Their AI downloads your session and creates <b>their own copy</b> — same history, their turn to continue. They open it with <code>/resume</code>.</p>

<h2>Later</h2>
${card("Catch up", "See what your teammate did on their copy.", P.catchup)}
${card("Go live", "Stream every turn between you in real time instead of syncing at the end of each reply.", P.live)}

<h2 id="how">Why it works</h2>
<div class="cards">
 <div class="card"><h3>Your AI already knows</h3><p>Your teammate's AI starts with everything yours figured out. No re-explaining.</p></div>
 <div class="card"><h3>Any account, any computer</h3><p>Different Claude or Codex logins don't matter.</p></div>
 <div class="card"><h3>Copies, not conflicts</h3><p>Everyone works on their own copy — like branches. Nothing gets overwritten.</p></div>
 <div class="card"><h3>Automatic</h3><p>Sessions sync in the background after every reply. Nothing to remember.</p></div>
</div>

<details><summary>For developers</summary>
<pre><span class="c"># one static binary + Claude Code / Codex hooks</span>
curl -fsSL ${esc(host)}/install.sh | bash && mc login ${esc(host)}
mc init                 <span class="c"># share this folder → invite link</span>
mc join &lt;invite&gt;        <span class="c"># teammate: pull + create own branch → /resume</span>
mc pull --all · mc branch &lt;name&gt; · mc ls · mc init --mode live</pre>
<p class="hint">Sync runs in editor hooks (push on stop, pull on start); the AI never spends a turn on it. Transcripts are append-only DAGs; joins create branches (<code>forked_from</code>). Agent instruction pages: <a href="/agent">/agent</a>. Self-host with <code>bun run server</code>. Source: <a href="https://github.com/aviramroi/multiclaude">github.com/aviramroi/multiclaude</a>.</p>
</details>
`,
    "Share a Claude Code or Codex session with a teammate. Paste one sentence into your AI, click Approve, done.",
  )
}

/**
 * Plain-text instructions an AI agent follows — one page per action, each with exact commands, an exact
 * reply template, and a do-not list. Served at /agent/<action> and /j/<key>/agent.
 */
export type AgentAction = "setup" | "share" | "catchup" | "live" | "join" | "email"
export function agentInstructions(host: string, action: AgentAction = "setup", join?: { key: string; mode: "turn" | "live" }) {
  const P = prompts(host)
  const head = `# multiclaude — ${action} — instructions for the AI agent

Follow these steps exactly, in order, using your shell tool. Do not ask the person to run anything.
Do not improvise other mc commands. Never run \`mc open\` (it needs a real terminal). Never read a pulled
transcript into your context — it is the person's data to resume in their editor.
`
  const ensure = `## A. Make sure mc is installed and connected (safe to repeat)
    export PATH="$HOME/.multiclaude/bin:$PATH"
    command -v mc >/dev/null || curl -fsSL ${host}/install.sh | bash
    export PATH="$HOME/.multiclaude/bin:$PATH"
    mc login ${host}
If the login output contains "APPROVAL NEEDED", remember the https://…/claim/… link — you will give it to the person.
`
  switch (action) {
    case "setup":
      return `${head}
${ensure}
## B. Reply to the person with exactly this (fill in the link), then stop:

    multiclaude is set up on this computer.
    Open this link and press Approve: <the claim link>
    When you want to share a project with a teammate, open me in that project and say:
    ${P.share}

If the login said the machine is already approved, replace the second line with "This computer is already approved."
`
    case "share":
      return `${head}
${ensure}
## B. Share the folder you are currently working in
First check: if the current folder is the person's home folder (~) or /, do NOT run mc init — ask them which
project folder to share and cd there. Then:
    mc init
It prints an "Invite for a teammate" sentence. Copy it exactly.

## C. Reply to the person with exactly this, then stop:

    This project is now shared. Every session you have here syncs automatically.
    Send this to your teammate — they paste it into their AI:
    <the invite sentence, exactly as mc printed it>
    Later, to see what they did, say to me: ${P.catchup}
`
    case "join":
      return `${head}
${ensure}
## B. Join — run INSIDE the folder the person wants to work in
If the current folder is their home folder (~) or /, ask which project folder to use and cd there first.
    mc join ${host}/j/${join?.key ?? "<key>"}${join?.mode === "live" ? "?mode=live" : ""}
This downloads the teammate's session and creates the person's OWN copy of it (a new session, same history).
mc prints the copy's name.

## C. Reply to the person with exactly this (fill in), then stop:

    You've joined the shared project. I made your own copy of "<teammate's session name>" with its full history: "<copy name>".
    To continue it: type /resume here in Claude Code and pick "<copy name>" — it's first in the list.
    Open this link and press Approve first if you haven't yet: <the claim link>   ← include this line only if login printed APPROVAL NEEDED
    Later, to fetch your teammate's newest work, say to me: ${P.catchup}
`
    case "catchup":
      return `${head}
${ensure}
## B. Fetch everyone's latest, in the current folder
    mc pull --all
It prints one line per session: name, +N new turns.

## C. Reply to the person with exactly this, then stop:

    Fetched your team's sessions:
    <one bullet per session: "<name> — <N> new turns" (or "no new turns")>
    To continue any of them: type /resume here in Claude Code and pick it by name.
`
    case "email":
      return `${head}
This configures how the server emails approval codes. Only the server admin (the first approved email) can do it.

## A. Ask the person — do not guess — for exactly these, one question:
    • Which email account should send the codes? (Gmail, Outlook, iCloud, or a Resend API key)
    • For Gmail/Outlook/iCloud: the email address and an APP PASSWORD (Gmail: myaccount.google.com/apppasswords).
    • For Resend: the API key and a "from" address on their verified domain.
Wait for their answer before running anything.

## B. Run ONE of these (the server sends a test email and only saves if it works)
    export PATH="$HOME/.multiclaude/bin:$PATH"
    mc admin mail --preset gmail   --user them@gmail.com   --pass "<app password>"
    mc admin mail --preset outlook --user them@outlook.com --pass "<app password>"
    mc admin mail --preset icloud  --user them@icloud.com  --pass "<app password>"
    mc admin mail --provider resend --key re_xxx --from "multiclaude <no-reply@their-domain.com>"
    (turn off again: mc admin mail --off)

## C. Reply to the person with exactly this, then stop:

    Email is set up. I sent a test message to <their email> — check it arrived.
    From now on, approving a computer requires the 6-digit code we email.
`
    case "live":
      return `${head}
${ensure}
## B. Turn on live mode for the current folder
    mc init --mode live
(If the folder was already shared, this just switches it to live; the invite stays the same.)

## C. Reply to the person with exactly this, then stop:

    Live mode is on for this project. From your next reply, every turn streams to your teammates as it happens,
    and theirs stream to you. Teammates joining now get live mode too. To turn it off, say: "turn off multiclaude live mode" (I will run: mc init --mode turn).
`
  }
}

export function agentIndex(host: string) {
  return `# multiclaude — agent instruction pages

Each page is one action with exact commands and an exact reply template:
  ${host}/agent/setup     set up this computer and get the approval link
  ${host}/agent/share     share the current project → invite sentence
  ${host}/agent/catchup   fetch teammates' latest sessions
  ${host}/agent/live      turn on live streaming for the current project
  ${host}/agent/email     (admin) configure how approval codes are emailed — Gmail/Outlook/iCloud app password or Resend
  ${host}/j/<key>/agent   join a teammate's project (creates the person's own copy of the latest session)

Rules for all: never run \`mc open\`; never read transcripts into your context; sync is automatic via hooks, so never run mc push/pull except where a page says so.
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
    const share = prompts(opts.host).share
    body = `<h1 class="ok">You're all set</h1><p class="lead">This computer is now connected to <b>${esc(email)}</b>. You can go back to your AI.</p>
<p class="hint">Next, open your AI in the project you want to share and paste:</p>
<div class="copybox" style="font-size:15px">${esc(share)}<button class="copy" data-copy="${esc(share)}">Copy</button></div>
<p style="margin-top:18px"><a class="btn sec block" href="/account">See my sessions</a></p>`
  }
  return page("Approve — multiclaude", `<div class="box">${body}</div>`)
}

export function accountPage(opts: { email: string; machines: { name: string; created_at: string }[]; sessions: { id: string; name: string | null; adapter: string; entries: number; updated_at: string; share_key: string; forked_from?: string | null }[]; host: string; admin?: boolean }) {
  const rows = opts.sessions
    .map((s) => {
      const invite = invitePrompt(opts.host, s.share_key, "turn")
      const when = new Date(s.updated_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
      const branchOf = s.forked_from ? ` · branch of ${esc(opts.sessions.find((x) => x.id === s.forked_from)?.name ?? s.forked_from.slice(0, 8))}` : ""
      return `<div class="row"><div><div class="t">${esc(s.name ?? s.id.slice(0, 8))}</div><div class="s">${esc(s.adapter === "codex" ? "Codex" : "Claude Code")} · ${s.entries} turns · ${esc(when)}${branchOf}</div></div>
<button class="mini" data-copy="${esc(invite)}">Copy invite</button></div>`
    })
    .join("")
  return page(
    "My sessions — multiclaude",
    `<h1 style="font-size:32px;margin-top:40px">My sessions</h1>
<p class="lead">${esc(opts.email)} · ${opts.machines.length} computer${opts.machines.length === 1 ? "" : "s"} connected</p>
${rows || `<p class="lead">No sessions yet. Open your AI in a project and paste the “Share this project” sentence from the <a href="/">home page</a>.</p>`}
<p class="hint" style="margin-top:18px">“Copy invite” gives you a sentence to send a teammate — they paste it into their AI.</p>
<h2 style="font-size:20px">Catch up on your teammates' work</h2>
<div class="copybox" style="font-size:15px">${esc(prompts(opts.host).catchup)}<button class="copy" data-copy="${esc(prompts(opts.host).catchup)}">Copy</button></div>
${opts.admin ? `<p class="hint" style="margin-top:32px">You're the admin of this server · <a href="/admin">Email settings</a></p>` : ""}
<form method="post" action="/account/logout" style="margin-top:24px"><button class="btn sec">Sign out</button></form>`,
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

export function adminPage(opts: { host: string; email: string; cfg: import("./mail").MailConfig | null; error?: string; values?: Record<string, string> }) {
  const v = opts.values ?? {}
  const cur = opts.cfg
  const provider = v.provider ?? cur?.provider ?? "smtp"
  const status = cur
    ? `<p class="lead" style="font-size:16px"><span class="ok">●</span> Email is on — approval codes are sent via <b>${esc(cur.provider === "resend" ? "Resend" : `SMTP (${cur.smtpHost})`)}</b> from <b>${esc(cur.from)}</b>.</p>`
    : `<p class="lead" style="font-size:16px"><span class="warn">●</span> Email is off — approval links work without a code. Set up a sender below to require verified emails.</p>`
  return page(
    "Email settings — multiclaude",
    `<h1 style="font-size:30px;margin-top:40px">Email settings</h1>
${status}
${opts.error ? `<p class="warn">${esc(opts.error)}</p>` : ""}
<form method="post" action="/admin/mail" class="box" style="margin:18px 0">
<label>How should codes be sent?</label>
<select name="provider" onchange="document.querySelectorAll('[data-p]').forEach(e=>e.style.display=e.dataset.p===this.value?'':'none')" style="width:100%;font:17px inherit;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)">
 <option value="smtp" ${provider === "smtp" ? "selected" : ""}>My email account (Gmail, Outlook, iCloud, or any SMTP)</option>
 <option value="resend" ${provider === "resend" ? "selected" : ""}>Resend (API key)</option>
</select>
<label>Send from</label><input name="from" required placeholder="you@gmail.com  or  multiclaude <no-reply@yourdomain.com>" value="${esc(v.from ?? cur?.from ?? opts.email)}">
<div data-p="smtp" style="${provider === "smtp" ? "" : "display:none"}">
 <label>Email provider</label>
 <select name="preset" style="width:100%;font:17px inherit;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--bg);color:var(--fg)">
  <option value="gmail">Gmail / Google Workspace</option><option value="outlook">Outlook / Microsoft 365</option><option value="icloud">iCloud</option><option value="">Other (fill host & port below)</option>
 </select>
 <label>Username (usually your email)</label><input name="smtpUser" value="${esc(v.smtpUser ?? cur?.smtpUser ?? "")}" placeholder="you@gmail.com">
 <label>Password / app password</label><input name="smtpPass" type="password" value="${esc(v.smtpPass ?? cur?.smtpPass ?? "")}" placeholder="Gmail: create an App Password at myaccount.google.com/apppasswords">
 <details style="margin:10px 0 0;border:0;padding:0"><summary>Other provider: host & port</summary>
 <label>SMTP host</label><input name="smtpHost" value="${esc(v.smtpHost ?? cur?.smtpHost ?? "")}" placeholder="smtp.example.com">
 <label>Port</label><input name="smtpPort" value="${esc(v.smtpPort ?? cur?.smtpPort ?? "")}" placeholder="587">
 <label><input type="checkbox" name="smtpSecure" style="width:auto" ${cur?.smtpSecure ? "checked" : ""}> Use TLS on connect (port 465)</label></details>
</div>
<div data-p="resend" style="${provider === "resend" ? "" : "display:none"}">
 <label>Resend API key</label><input name="resendKey" type="password" value="${esc(v.resendKey ?? cur?.resendKey ?? "")}" placeholder="re_…">
 <p class="hint">The “Send from” address must be on a domain you verified in Resend.</p>
</div>
<p style="margin-top:20px"><button class="btn block">Save and send me a test email</button></p>
</form>
${cur ? `<form method="post" action="/admin/mail"><input type="hidden" name="action" value="clear"><button class="btn sec">Turn email off</button></form>` : ""}
<p class="hint" style="margin-top:24px">Prefer your AI to do it? Say: <code>Please configure multiclaude email by following ${esc(opts.host)}/agent/email exactly</code> — it will ask you for the details and run <code>mc admin mail</code>.</p>`,
  )
}

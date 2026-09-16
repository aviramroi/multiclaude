import nodemailer from "nodemailer"
import type { Store } from "./store"

/**
 * Mail provider, configured by the server admin from /admin (or `mc admin mail`) and stored in the
 * settings table — no redeploy, no env vars. Env (RESEND_API_KEY / SMTP_URL) still works as a fallback.
 */
export interface MailConfig {
  provider: "resend" | "smtp"
  from: string
  resendKey?: string
  smtpHost?: string
  smtpPort?: number
  smtpUser?: string
  smtpPass?: string
  smtpSecure?: boolean
}

export async function loadMailConfig(store: Store): Promise<MailConfig | null> {
  const raw = await store.getSetting("mail")
  if (raw) {
    try {
      const c = JSON.parse(raw) as MailConfig
      if (c.provider && c.from) return c
    } catch {}
  }
  if (process.env.RESEND_API_KEY) return { provider: "resend", from: process.env.MAIL_FROM ?? "multiclaude <noreply@multiclaude.dev>", resendKey: process.env.RESEND_API_KEY }
  if (process.env.SMTP_URL) {
    const u = new URL(process.env.SMTP_URL)
    return { provider: "smtp", from: process.env.MAIL_FROM ?? decodeURIComponent(u.username), smtpHost: u.hostname, smtpPort: Number(u.port || 587), smtpUser: decodeURIComponent(u.username), smtpPass: decodeURIComponent(u.password), smtpSecure: u.protocol === "smtps:" }
  }
  return null
}

export async function sendMail(cfg: MailConfig, to: string, subject: string, text: string) {
  if (cfg.provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.resendKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: cfg.from, to: [to], subject, text }),
    })
    if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
    return
  }
  const t = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort ?? 587,
    secure: cfg.smtpSecure ?? (cfg.smtpPort === 465),
    auth: cfg.smtpUser ? { user: cfg.smtpUser, pass: cfg.smtpPass } : undefined,
  })
  await t.sendMail({ from: cfg.from, to, subject, text })
}

export async function sendClaimCode(cfg: MailConfig | null, email: string, code: string, host: string) {
  if (!cfg) {
    console.log(`[mail:dev] code for ${email}: ${code}`)
    return
  }
  await sendMail(
    cfg,
    email,
    `${code} is your multiclaude code`,
    `Your AI asked to connect a computer to multiclaude (${host}).\n\nEnter this code to approve it: ${code}\n\nIt expires in 10 minutes. If you didn't expect this, ignore this email — nothing is created without the code.`,
  )
}

/** Gmail users only need an app password; presets fill the rest. */
export const SMTP_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  gmail: { host: "smtp.gmail.com", port: 465, secure: true },
  outlook: { host: "smtp.office365.com", port: 587, secure: false },
  icloud: { host: "smtp.mail.me.com", port: 587, secure: false },
}

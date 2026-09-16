export const mailConfigured = () => !!process.env.RESEND_API_KEY

/** Send a claim code. Uses Resend when RESEND_API_KEY is set; otherwise logs it (dev mode). */
export async function sendClaimCode(email: string, code: string, host: string) {
  const key = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM ?? "multiclaude <noreply@multiclaude.dev>"
  if (!key) {
    console.log(`[mail:dev] claim code for ${email}: ${code}`)
    return
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `${code} is your multiclaude code`,
      text: `Your agent asked to create a multiclaude account on ${host}.\n\nEnter this code to approve it: ${code}\n\nIf you didn't expect this, ignore this email — nothing is created without the code.`,
    }),
  })
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`)
}

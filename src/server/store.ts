import type { WireEntry } from "../core/transcript"

export interface User { id: string; name: string; email?: string | null; claim_code?: string | null; claimed_at?: string | null; created_at?: string }
export interface Session { id: string; name: string | null; owner: string; adapter: string; share_key: string; forked_from?: string | null; created_at: string; updated_at: string }
export type StoredEntry = WireEntry & { seq: number; author: string }

/** Everything the HTTP app needs from a database. SQLite (Bun) and Postgres (Vercel/Neon) implement it. */
export interface Store {
  userByToken(token: string): Promise<User | null>
  userByClaim(code: string): Promise<User | null>
  createUser(u: { id: string; name: string; token: string; claimCode: string }): Promise<void>
  claimUser(id: string, email: string): Promise<void>
  machinesByEmail(email: string): Promise<{ name: string; created_at: string }[]>

  session(id: string): Promise<Session | null>
  createSession(s: { id: string; name: string | null; owner: string; adapter: string; shareKey: string; forkedFrom?: string | null }): Promise<void>
  sessionsFor(userId: string, shareKey: string | null): Promise<Session[]>
  sessionsByEmail(email: string): Promise<Session[]>
  countByKey(shareKey: string): Promise<number>
  isMember(sessionId: string, userId: string): Promise<boolean>
  addMember(sessionId: string, userId: string): Promise<void>
  touch(sessionId: string): Promise<void>

  head(sessionId: string): Promise<{ head: number; n: number }>
  existingIds(sessionId: string, ids: string[]): Promise<Set<string>>
  insertEntries(sessionId: string, entries: WireEntry[], author: string): Promise<StoredEntry[]>
  entriesAfter(sessionId: string, after: number): Promise<StoredEntry[]>

  setOtp(email: string, code: string, expiresAt: number): Promise<void>
  getOtp(email: string): Promise<{ code: string; expires_at: number; attempts: number } | null>
  bumpOtp(email: string): Promise<void>
  deleteOtp(email: string): Promise<void>
  createBrowserSession(id: string, email: string): Promise<void>
  browserEmail(id: string): Promise<string | null>
}

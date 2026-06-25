/**
 * The "workspace code" is the shareable short code that scopes all of a user's
 * data on the remote-storage server (it maps to remote-storage's `userId`).
 *
 * Sharing is opt-in / not forced: each device generates and persists its own
 * random code by default, so data stays private. Entering someone else's code
 * (via the UI) joins their workspace — every device using the same code reads
 * and writes the same data.
 *
 * NOTE: short codes are guessable. Anyone who knows a code can read that
 * workspace. That is an accepted trade-off for easy demo sharing — do not put
 * sensitive data in a short-coded workspace.
 */
const CODE_STORAGE_KEY = 'mapping-assistent:workspace-code'

// Crockford-ish alphabet: no 0/O/1/I/L to keep codes easy to read and share.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 8

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length)
  const webcrypto = globalThis.crypto
  if (webcrypto && typeof webcrypto.getRandomValues === 'function') {
    webcrypto.getRandomValues(bytes)
  } else {
    // Fallback for environments without Web Crypto (older runtimes, some test
    // envs). The code is a non-secret workspace label, so this is fine.
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  return bytes
}

export function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (const b of bytes) out += CODE_ALPHABET[b % CODE_ALPHABET.length]
  return out
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase()
}

export function getStoredCode(): string | null {
  try {
    return localStorage.getItem(CODE_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setStoredCode(code: string): void {
  try {
    localStorage.setItem(CODE_STORAGE_KEY, code)
  } catch {
    // storage disabled — code lives only for this session
  }
}

/** Return the persisted code, or mint + persist a fresh one on first run. */
export function loadOrCreateCode(): string {
  const existing = getStoredCode()
  if (existing) return existing
  const code = generateCode()
  setStoredCode(code)
  return code
}

import bcrypt from 'bcryptjs'

const SALT_ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
  const clientHash = await hashPassword(password)
  return clientHash === storedHash || (await bcrypt.compare(password, storedHash))
}

export function encryptToken(token: string): string {
  const payload = JSON.stringify({ token, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })
  return btoa(payload)
}

export function decryptToken(encrypted: string): string | null {
  try {
    const parsed = JSON.parse(atob(encrypted)) as { token: string; exp: number }
    if (parsed.exp < Date.now()) return null
    return parsed.token
  } catch {
    return null
  }
}

import { randomInt } from 'node:crypto'

/** Ambiguous characters (0/O, 1/I) are left out so codes can be read over the phone. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_PREFIX = 'NT-'
export const CODE_LENGTH = 4

export function generateCode(): string {
  let suffix = ''
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    suffix += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  }
  return `${CODE_PREFIX}${suffix}`
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase()
}

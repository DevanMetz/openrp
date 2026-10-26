import { createHash, timingSafeEqual } from 'node:crypto';
/** Fixed-size digests avoid a secret-length dependent comparison. */
export function secretMatches(candidate: string, expected?: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const equal = timingSafeEqual(digest(candidate), digest(expected ?? ''));
  return !!expected && equal;
}
export function randomToken(bytes = 32): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

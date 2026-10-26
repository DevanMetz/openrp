/** Workers ingress supplies the authoritative visitor address. */
export const clientIP = (request: Request): string => request.headers.get('CF-Connecting-IP') ?? 'unknown';

/** Limits connection churn, never the number of joined residents. */
export class JoinRate {
  private attempts = new Map<string, { count: number; start: number }>();
  allow(ip: string, now = Date.now()): boolean {
    let entry = this.attempts.get(ip);
    if (!entry || now - entry.start >= 60_000) {
      entry = { count: 0, start: now };
      this.attempts.set(ip, entry);
    }
    return ++entry.count <= 120;
  }
  prune(now = Date.now()): void {
    for (const [ip, entry] of this.attempts) if (now - entry.start >= 60_000) this.attempts.delete(ip);
  }
}

import type { IncomingMessage } from 'node:http';
import { isIP, BlockList } from 'node:net';

// Cloudflare's published ingress networks, verified 2026-09-07:
// https://www.cloudflare.com/ips-v4/ and https://www.cloudflare.com/ips-v6/
const cloudflare = new BlockList();
for (const cidr of [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
]) {
  const [network, prefix] = cidr.split('/');
  cloudflare.addSubnet(network, Number(prefix), isIP(network) === 6 ? 'ipv6' : 'ipv4');
}

/** Only enable Railway headers when the origin is reachable through Railway's edge. */
export function clientIP(req: IncomingMessage, proxy: string): string {
  const forwarded = req.headers['x-real-ip'];
  if (proxy === 'railway' && typeof forwarded === 'string' && isIP(forwarded)) {
    const peer = forwarded.replace(/^::ffff:/, '');
    const visitor = req.headers['cf-connecting-ip'];
    // Never accept a user-supplied CF header arriving directly at Railway.
    if (
      typeof visitor === 'string' &&
      isIP(visitor) &&
      cloudflare.check(peer, isIP(peer) === 6 ? 'ipv6' : 'ipv4')
    )
      return visitor;
    return peer;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

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

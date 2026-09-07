import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Game, Profile } from './game.ts';

export interface Account {
  username: string;
  passwordHash: string;
}
const USERNAME = /^[a-z0-9][a-z0-9_.-]{2,23}$/;
const PASSWORD_HASH = /^scrypt\$32768\$8\$3\$[a-f0-9]{32}\$[a-f0-9]{64}$/;
const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export function validAccount(value: unknown): value is Account {
  if (!value || typeof value !== 'object') return false;
  const a = value as Account;
  return (
    typeof a.username === 'string' &&
    USERNAME.test(a.username) &&
    typeof a.passwordHash === 'string' &&
    PASSWORD_HASH.test(a.passwordHash)
  );
}
export function profileForToken(game: Game, token: unknown): Profile | undefined {
  return typeof token === 'string' && /^[a-f0-9]{64}$/.test(token)
    ? game.profiles.get(tokenHash(token))
    : undefined;
}
async function derive(password: string, salt: string): Promise<Buffer> {
  // OWASP's 32 MiB scrypt configuration; async work keeps the simulation thread responsive.
  return new Promise((done, fail) =>
    scrypt(password, salt, 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? fail(error) : done(key),
    ),
  );
}
async function encodePassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
class AccountError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
function checkedPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128)
    throw new AccountError(400, 'Use a password or passphrase with 15 to 128 characters.');
  return value;
}

export class Accounts {
  private active = 0;
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(
    private game: Game,
    private checkpoint: () => void,
    private disconnect: (id: string) => void,
    private banned: (id: string) => boolean,
  ) {}
  private limit(key: string, max: number) {
    const now = Date.now();
    for (const [id, value] of this.attempts) if (value.until <= now) this.attempts.delete(id);
    const attempt = this.attempts.get(key) ?? { count: 0, until: now + 300_000 };
    this.attempts.set(key, attempt);
    if (++attempt.count > max) throw new AccountError(429, 'Too many attempts. Try again in five minutes.');
  }
  async handle(req: IncomingMessage, res: ServerResponse, ip: string, active: () => boolean): Promise<void> {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end('{"error":"Use POST."}');
      return;
    }
    try {
      this.limit(`ip:${ip}`, 30);
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
        throw new AccountError(415, 'Send a JSON request.');
      const chunks: Buffer[] = [];
      let bytes = 0;
      req.setTimeout(5000, () => req.destroy());
      for await (const chunk of req) {
        bytes += Buffer.byteLength(chunk);
        if (bytes > 4096) throw new AccountError(413, 'Account request is too large.');
        chunks.push(Buffer.from(chunk));
      }
      let input: Record<string, unknown>;
      try {
        input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        throw new AccountError(400, 'Invalid account request.');
      }
      if (!input || typeof input !== 'object' || Array.isArray(input))
        throw new AccountError(400, 'Invalid account request.');
      if (input.action === 'logout') {
        const profile = profileForToken(this.game, input.token);
        if (!profile?.account) throw new AccountError(401, 'Sign in again.');
        if (!active()) throw new AccountError(503, 'Server restarting. Try again shortly.');
        this.issue(profile);
        res.end('{"ok":true}');
        return;
      }
      if (input.action !== 'register' && input.action !== 'login')
        throw new AccountError(400, 'Choose sign in or create account.');
      const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
      if (!USERNAME.test(username))
        throw new AccountError(
          400,
          'Use 3 to 24 letters, numbers, dots, underscores or hyphens for your username.',
        );
      const password = checkedPassword(input.password);
      this.limit(`user:${username}`, 10);
      if (this.active >= 2) throw new AccountError(503, 'Sign in is busy. Try again in a moment.');
      this.active++;
      let profile: Profile | undefined;
      let account: Account | undefined;
      try {
        profile = [...this.game.profiles.values()].find((p) => p.account?.username === username);
        if (input.action === 'login') {
          const encoded = profile?.account?.passwordHash;
          const parts = encoded?.split('$');
          const actual = await derive(password, parts?.[4] ?? '00000000000000000000000000000000');
          if (!encoded || !timingSafeEqual(actual, Buffer.from(parts![5], 'hex')))
            throw new AccountError(401, 'Incorrect username or password.');
        } else {
          if (profile) throw new AccountError(409, 'That username is already taken.');
          profile = profileForToken(this.game, input.token);
          if (input.token && !profile)
            throw new AccountError(
              409,
              'Your saved guest could not be found. Sign in or rejoin as a guest first.',
            );
          if (profile?.account)
            throw new AccountError(409, 'These belongings already belong to an account. Sign in instead.');
          account = { username, passwordHash: await encodePassword(password) };
          // Recheck after hashing so concurrent requests cannot claim the same name or guest.
          if (
            profile?.account ||
            [...this.game.profiles.values()].some((p) => p.account?.username === username)
          )
            throw new AccountError(409, 'That username or guest has already been claimed.');
        }
        if (!active()) throw new AccountError(503, 'Server restarting. Try again shortly.');
        if (profile && this.banned(profile.id))
          throw new AccountError(403, 'This identity is banned from the server.');
        profile ??= {
          id: randomUUID(),
          name: username,
          money: this.game.options.startingMoney,
          tokenHash: '',
        };
        const token = this.issue(profile, account);
        res.end(JSON.stringify({ token, username: profile.account!.username, name: profile.name }));
      } finally {
        this.active--;
      }
    } catch (error) {
      if (res.destroyed) return;
      const known = error instanceof AccountError;
      const status = known ? error.status : 503;
      if (status === 429 || status === 503) res.setHeader('Retry-After', status === 429 ? '300' : '2');
      res.writeHead(status);
      res.end(
        JSON.stringify({ error: known ? error.message : 'Could not save your account. Please try again.' }),
      );
    }
  }
  private issue(profile: Profile, account?: Account): string {
    const previousHash = profile.tokenHash,
      previousAccount = profile.account;
    const token = randomBytes(32).toString('hex');
    this.game.profiles.delete(previousHash);
    profile.tokenHash = tokenHash(token);
    if (account) profile.account = account;
    this.game.profiles.set(profile.tokenHash, profile);
    try {
      this.checkpoint();
    } catch (error) {
      this.game.profiles.delete(profile.tokenHash);
      profile.tokenHash = previousHash;
      profile.account = previousAccount;
      if (previousHash) this.game.profiles.set(previousHash, profile);
      throw error;
    }
    this.disconnect(profile.id);
    return token;
  }
}

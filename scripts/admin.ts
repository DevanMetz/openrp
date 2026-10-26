export {};
const [action = 'list', id = '', ...words] = process.argv.slice(2);
if (!['list', 'kick', 'ban', 'unban', 'cleanup', 'announce'].includes(action)) {
  console.error('Usage: admin.ts list | kick/ban/unban/cleanup <resident-id> [reason] | announce <message>');
  process.exit(1);
}
const key = process.env.ADMIN_TOKEN;
if (!key) throw new Error('Set ADMIN_TOKEN in your environment.');
const base = new URL(process.env.OPENRP_ADMIN_URL ?? 'https://openrp.dev');
if (
  base.protocol !== 'https:' &&
  !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))
)
  throw new Error('Remote operator access requires HTTPS');
const response = await fetch(new URL('/api/admin', base), {
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
  method: action === 'list' ? 'GET' : 'POST',
  headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body:
    action === 'list'
      ? undefined
      : JSON.stringify({
          action,
          id,
          reason: action === 'announce' ? [id, ...words].join(' ') : words.join(' '),
        }),
});
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [action = 'list', id = '', ...words] = process.argv.slice(2);
if (!['list', 'kick', 'ban', 'unban', 'announce'].includes(action)) {
  console.error('Usage: admin.ts list | kick/ban/unban <resident-id> [reason] | announce <message>');
  process.exit(1);
}
// Read only inside the server/container; the key never enters the browser or repository.
const key = readFileSync(resolve(process.env.DATA_DIR ?? './data', '.admin-token'), 'utf8').trim();
const response = await fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/admin`, {
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

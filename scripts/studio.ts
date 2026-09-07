import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createServer as createVite } from 'vite';

// Local-only media export utility, excluded from the production container.
const output = resolve(process.argv[2] ?? './media-exports');
await mkdir(output, { recursive: true });
const port = 3174;
const server = createServer(async (req, res) => {
  if (req.url?.startsWith('/__capture/')) {
    const name = req.url.slice('/__capture/'.length);
    if (
      req.method !== 'POST' ||
      req.headers.origin !== `http://localhost:${port}` ||
      !['openrp-launch.webm', 'social-card.png'].includes(name)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    const parts: Buffer[] = [];
    let size = 0;
    try {
      for await (const data of req) {
        size += data.length;
        if (size > 150_000_000) throw new Error('Capture too large');
        parts.push(data);
      }
      await writeFile(join(output, name), Buffer.concat(parts));
      res.end('Saved');
      console.log(`Saved ${name} (${size} bytes)`);
    } catch {
      res.writeHead(400);
      res.end('Capture failed');
    }
    return;
  }
  vite.middlewares(req, res);
});
const vite = await createVite({
  server: { middlewareMode: true, hmr: { server, clientPort: port, path: '/__studio_hmr' } },
  appType: 'mpa',
});
server.listen(port, '127.0.0.1', () =>
  console.log(`Studio: http://localhost:${port}/studio.html\nExports: ${output}`),
);

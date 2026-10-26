import { unstable_dev } from 'wrangler';
import { createServer } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Isolated real workerd instance. Never falls back to a public deployment. */
export async function startLocalWorker(
  options: { persistTo?: string; vars?: Record<string, string>; port?: number } = {},
) {
  // Fail promptly on restricted hosts instead of leaving Wrangler's startup pending.
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => probe.close((error) => (error ? reject(error) : resolve())));
  });
  process.env.WRANGLER_LOG_PATH ??= '/tmp/openrp-wrangler.log';
  process.env.WRANGLER_SEND_METRICS = 'false';
  const dir = options.persistTo ?? (await mkdtemp(join(tmpdir(), 'openrp-worker-')));
  try {
    const worker = await unstable_dev('server/worker.ts', {
      config: 'wrangler.jsonc',
      local: true,
      logLevel: 'error',
      envFiles: [],
      ip: '127.0.0.1',
      port: options.port ?? 0,
      persist: true,
      persistTo: dir,
      vars: {
        ALLOWED_ORIGINS: '',
        ADMIN_TOKEN: '',
        ANALYTICS_READ_TOKEN: '',
        SERVER_PASSWORD: '',
        ...options.vars,
      },
      experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
    });
    return {
      ...worker,
      base: `http://${worker.address}:${worker.port}`,
      close: async () => {
        await worker.stop();
        if (!options.persistTo) await rm(dir, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (!options.persistTo) await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

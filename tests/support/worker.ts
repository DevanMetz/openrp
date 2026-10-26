import { startLocalWorker } from '../../scripts/worker-local.ts';
import type { SavedWorld } from '../../server/game.ts';

/** Real production entry and DO; fixtures enter through the authenticated backup API. */
export async function startTestWorker(
  options: {
    dataDir?: string;
    adminKey?: string;
    analyticsReadKey?: string;
    password?: string;
    vars?: Record<string, string>;
  } = {},
) {
  const adminKey = options.adminKey ?? 'isolated-test-operator';
  const app = await startLocalWorker({
    persistTo: options.dataDir,
    vars: {
      ADMIN_TOKEN: adminKey,
      ANALYTICS_READ_TOKEN: options.analyticsReadKey ?? '',
      SERVER_PASSWORD: options.password ?? '',
      ...options.vars,
    },
  });
  const headers = { Authorization: `Bearer ${adminKey}` };
  return {
    ...app,
    status: async () => (await fetch(app.base + '/api/status')).json(),
    world: async (): Promise<SavedWorld> => (await fetch(app.base + '/api/admin/world', { headers })).json(),
    restore: async (world: SavedWorld) => {
      const response = await fetch(app.base + '/api/admin/world', {
        method: 'POST',
        headers,
        body: JSON.stringify(world),
      });
      if (!response.ok) throw new Error(`Fixture import failed: ${await response.text()}`);
    },
  };
}

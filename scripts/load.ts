import { once } from 'node:events';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { WebSocket } from 'ws';
import { startServer } from '../server/main.ts';
import { idleInput } from '../shared/movement.ts';
import type { ServerMessage } from '../shared/types.ts';

// Intentionally starts an isolated loopback world; never sends load to a public server.
const count = Math.max(1, Math.min(110, Number(process.argv[2]) || 100));
const seconds = Math.max(5, Math.min(60, Number(process.argv[3]) || 15));
const app = await startServer({ port: 0, host: '127.0.0.1', production: true, persist: false });
const clients: WebSocket[] = [],
  latencies: number[] = [];
let bytes = 0,
  frames = 0,
  seq = 0;
const delay = monitorEventLoopDelay({ resolution: 10 });
try {
  for (let i = 0; i < count; i++) {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`);
    clients.push(ws);
    await once(ws, 'open');
    const joined = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Join timeout')), 4000);
      ws.on('message', (raw) => {
        const msg: ServerMessage = JSON.parse(raw.toString());
        if (msg.type === 'welcome') {
          clearTimeout(timeout);
          resolve();
        }
        if (msg.type === 'pong') latencies.push(Date.now() - msg.time);
        if (msg.type === 'state' || msg.type === 'delta') {
          bytes += raw.toString().length;
          frames++;
        }
      });
    });
    ws.send(JSON.stringify({ type: 'join', name: `Load Resident ${i}` }));
    await joined;
  }
  bytes = frames = 0;
  delay.enable();
  const began = performance.now();
  const input = setInterval(() => {
    seq++;
    for (const [i, ws] of clients.entries())
      ws.send(
        JSON.stringify({
          type: 'input',
          input: {
            ...idleInput(),
            seq,
            forward: Math.sin(seq / 35 + i) > 0 ? 1 : -1,
            yaw: i * 0.63,
            sprint: i % 2 === 0,
          },
        }),
      );
    if (seq % 30 === 0) clients[0].send(JSON.stringify({ type: 'ping', time: Date.now() }));
  }, 1000 / 30);
  await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  clearInterval(input);
  delay.disable();
  const elapsed = (performance.now() - began) / 1000;
  console.log(
    JSON.stringify(
      {
        scenario:
          'isolated local synthetic movement over real WebSockets; not a production capacity guarantee',
        residents: app.game.players.size,
        connectionsOpen: clients.filter((ws) => ws.readyState === WebSocket.OPEN).length,
        elapsedSeconds: +elapsed.toFixed(2),
        snapshotsPerClientPerSecond: +(frames / count / elapsed).toFixed(2),
        totalOutboundMiBPerSecond: +(bytes / 1048576 / elapsed).toFixed(2),
        meanPingMs: +(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length)).toFixed(2),
        eventLoopP99Ms: +(delay.percentile(99) / 1e6).toFixed(2),
        processMemoryMiB: +(process.memoryUsage().rss / 1048576).toFixed(1),
      },
      null,
      2,
    ),
  );
  if (app.game.players.size !== count || clients.some((ws) => ws.readyState !== WebSocket.OPEN))
    process.exitCode = 1;
} finally {
  clients.forEach((ws) => ws.terminate());
  await app.close();
}

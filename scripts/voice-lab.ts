import { startLocalWorker } from './worker-local.ts';

// Isolated, disposable browser QA. No production state, test endpoints or microphone access.
const app = await startLocalWorker({ port: 3175 });
console.log(`Voice lab: http://localhost:${app.port}/voice-lab.html`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });

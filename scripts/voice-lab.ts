import { startServer } from '../server/main.ts';

// Isolated, disposable browser QA. No production state, test endpoints or microphone access.
const app = await startServer({ port: 3175, host: '127.0.0.1', production: false, persist: false });
console.log(`Voice lab: http://localhost:${app.port}/voice-lab.html`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });

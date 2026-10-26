import { spawn } from 'node:child_process';
const build = spawn('npm', ['run', 'build'], { stdio: 'inherit' });
await new Promise<void>((resolve, reject) =>
  build.once('exit', (code) => (code === 0 ? resolve() : reject(new Error('Client build failed')))),
);
const children = [
  spawn('npx', ['vite', 'build', '--watch'], { stdio: 'inherit' }),
  spawn('npx', ['wrangler', 'dev'], { stdio: 'inherit' }),
];
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
for (const child of children)
  child.once('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });

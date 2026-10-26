import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const children = new Set<ChildProcess>();
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
function run(script: string, args: string[]) {
  // Launch the tools directly so signals reach them, without an npm/npx wrapper process.
  const child = spawn(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    stdio: 'inherit',
  });
  children.add(child);
  child.once('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  child.once('exit', () => children.delete(child));
  return child;
}
const build = run('../node_modules/vite/bin/vite.js', ['build']);
const built = await new Promise<boolean>((resolve) => {
  build.once('error', () => resolve(false));
  build.once('exit', (code) => resolve(code === 0));
});
if (!built) {
  if (!stopping) process.exitCode = 1;
  stop();
} else if (!stopping) {
  for (const child of [
    run('../node_modules/vite/bin/vite.js', ['build', '--watch']),
    run('../node_modules/wrangler/bin/wrangler.js', ['dev']),
  ])
    child.once('exit', (code) => {
      if (!stopping) {
        process.exitCode = code ?? 1;
        stop();
      }
    });
}

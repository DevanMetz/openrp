import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      input: { main: 'index.html', studio: 'studio.html', voiceLab: 'voice-lab.html' },
      output: { manualChunks: { three: ['three'] } },
    },
  },
});

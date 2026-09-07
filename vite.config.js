import { defineConfig } from 'vite';

// Plain vanilla JS app. No framework plugins needed.
// The app is fully client-side; there is no backend.
export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    target: 'es2022',
  },
  server: {
    // Needed so the File System Access API is available in a secure context.
    // localhost is treated as secure, so no extra config is required.
    open: true,
  },
});

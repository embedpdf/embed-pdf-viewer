import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// This app consumes @embedpdf/viewer-react (source) over @embedpdf/viewer
// (prebuilt dist — the Preact artifact). No aliasing here: the host React and
// the viewer's interior Preact coexist by design.
export default defineConfig({
  server: {
    port: 5240,
    strictPort: true,
    allowedHosts: ['.ngrok-free.app'],
  },
  plugins: [react()],
});

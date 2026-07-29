import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiPort = Number(process.env['CLOUDPDF_SMOKE_API_PORT'] ?? 3211);
const enginePort = Number(process.env['CLOUDPDF_SMOKE_ENGINE_PORT'] ?? 3210);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // `/api` is this demo's own admin helper (token minting, uploads, shares);
    // `/v1` is the real @cloudpdf/server. Same-origin through the dev server, so
    // the browser talks to the engine with `baseUrl: ''` — the shape a
    // production app behind a reverse proxy actually uses.
    proxy: {
      '/api': `http://127.0.0.1:${apiPort}`,
      '/v1': `http://127.0.0.1:${enginePort}`,
    },
  },
});

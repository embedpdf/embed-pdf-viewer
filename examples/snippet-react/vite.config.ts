import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// All packages resolve from source through their own package.json `exports`
// maps: the v3 packages via dev entries pointing at src/ (internal-packages
// pattern), the engine family via its `development` condition (tooling/build
// epdf.devExports), which Vite's dev server applies automatically.
export default defineConfig({
  server: { port: 5200, strictPort: true },
  worker: { format: 'es' },
  plugins: [react(), tailwindcss()],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// All packages resolve from source through their own package.json `exports`
// maps: the client stack via dev entries pointing at src/ (internal-packages
// pattern), the engine family via its `development` condition (tooling/build
// epdf.devExports), which Vite's dev server applies automatically.
export default defineConfig({
  server: { port: 5199, strictPort: true },
  worker: { format: 'es' },
  plugins: [react()],
});

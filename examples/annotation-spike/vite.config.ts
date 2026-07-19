import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  server: { port: 5200, strictPort: true },
  plugins: [react()],
});

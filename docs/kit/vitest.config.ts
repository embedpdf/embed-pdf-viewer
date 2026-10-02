import { defineConfig } from 'vitest/config';

// Components compile with the automatic JSX runtime, as Next compiles them for the sites.
export default defineConfig({ esbuild: { jsx: 'automatic' } });

import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// `@/` reads from `src`, as `tsconfig.json` has it for Next.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'models',
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

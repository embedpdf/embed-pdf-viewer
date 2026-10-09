/**
 * Tests run in happy-dom with the Vue plugin, so components are mounted from
 * their single-file source the way an app's build compiles them.
 */
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
  },
});

/**
 * plugins/index.ts
 *
 * Automatically included in `./src/main.ts`
 */

// Plugins
import quasar from './quasar';

// Types
import type { App } from 'vue';

export function registerPlugins(app: App) {
  app.use(quasar, {
    config: {},
  });
}

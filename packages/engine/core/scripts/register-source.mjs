/**
 * Lets Node run engine-core's TypeScript source as it is (`--experimental-transform-types`): its
 * relative imports leave out the extension (`./kinds/link/values`), which a bundler resolves and
 * Node doesn't. Used by `pnpm generate` (`scripts/generate-kind-facts.ts`).
 */
import { register } from 'node:module';

register('./resolve-source.mjs', import.meta.url);

/**
 * The runtime's public build identity — a Node-only, SIDE-EFFECT-FREE
 * subpath (`@embedpdf/engine-runtime/build-id`): importing it never
 * touches native-addon loading, so supervisors and diagnostics can name
 * the engine without running it.
 *
 * The identity is `version:target` (e.g. `3.0.0-next.7:linux-arm64`),
 * BOTH axes on purpose: deployments sharing one database can run
 * different native binaries (multi-arch images, mixed node pools), and
 * native crashers can be target-specific — consumers keying state on the
 * engine identity (e.g. crash quarantine) must never pool evidence
 * across different binaries, nor reset it when only the *other* arch
 * upgraded.
 *
 * The version is read from this package's own manifest at import time —
 * a self-relative read, which the `exports` map does not govern — so
 * there is no generation step and nothing to drift.
 */
import { createRequire } from 'node:module';

import type { RuntimeTarget } from './core/platform';
import { resolveRuntimeTarget } from './core/platform.node';

const require = createRequire(import.meta.url);

export const ENGINE_RUNTIME_VERSION: string = (
  require('../package.json') as { version: string }
).version;

/** The native target this process would load (null: unsupported platform). */
export function engineRuntimeTarget(): RuntimeTarget | null {
  return resolveRuntimeTarget();
}

/** `version:target` — the engine identity for supervisors and journals. */
export function engineRuntimeBuildId(): string {
  return `${ENGINE_RUNTIME_VERSION}:${resolveRuntimeTarget() ?? 'unknown'}`;
}

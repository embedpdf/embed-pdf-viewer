import type { ScriptSandbox, ScriptSandboxFactory } from '@embedpdf/core-acrojs';

/**
 * The structural sandbox contract is OWNED by `@embedpdf/core-acrojs` (this
 * package depends on it — the reverse import would be a cycle); re-exported
 * here so implementations and their consumers keep one import site.
 */
export type { ScriptSandbox, ScriptSandboxFactory };

export interface QuickJsSandboxOptions {
  /** Compatibility prelude to install. Defaults to acrojs-core's built prelude. */
  preludeSource?: string;
}

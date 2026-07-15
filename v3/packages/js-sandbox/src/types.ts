import type { ScriptBudget, ScriptInput, ScriptOutput } from '@embedpdf-x/acrojs-core';

/** One isolated, stateful Acrobat-JavaScript realm for one PDF document. */
export interface ScriptSandbox {
  /** True after explicit disposal or a resource/runtime fault. */
  readonly disposed: boolean;

  /**
   * Evaluate document name-tree sources once. Top-level effects are returned so
   * the orchestrator can include them in the first originating transaction.
   */
  boot(sources: string[], input: ScriptInput, budget?: ScriptBudget): ScriptOutput;

  /** Run one field event against the realm's persistent document globals. */
  run(source: string, input: ScriptInput, budget?: ScriptBudget): ScriptOutput;

  /** Release the per-document QuickJS context and runtime. Idempotent. */
  dispose(): void;
}

export type ScriptSandboxFactory = () => Promise<ScriptSandbox>;

export interface QuickJsSandboxOptions {
  /** Compatibility prelude to install. Defaults to acrojs-core's built prelude. */
  preludeSource?: string;
}

import type { DocumentHandle } from '@embedpdf/engine-core/runtime';

import { DEFAULT_SCRIPT_BUDGET } from './types';
import type {
  ScriptAnnotInput,
  ScriptBudget,
  ScriptDocumentInput,
  ScriptEnvironment,
  ScriptEventInput,
  ScriptFieldInput,
  ScriptIdentity,
  ScriptInput,
  ScriptOutput,
  ScriptSandbox,
  ScriptSandboxFactory,
} from './types';

/** The per-run world a CALLER supplies (fields snapshot, prefetched annots
 *  plane, the event). Document/identity/environment come from the host. */
export interface ScriptWorldInput {
  fields: ScriptFieldInput[];
  annots?: ScriptAnnotInput[];
  annotPages?: number[];
  annotsCoverDocument?: boolean;
  /** Zero-based current page for `this.pageNum` — overrides the host's
   *  document input (the form pipeline anchors it on the target field). */
  pageNumber?: number;
  event: ScriptEventInput;
}

export interface ScriptTransaction {
  /**
   * Run the name-tree boot if it has not run in this realm yet; returns the
   * boot output exactly ONCE (its effects belong to the first transaction —
   * commit them, tag their UI effects `phase: 'boot'`), null thereafter.
   */
  boot(world: ScriptWorldInput, budget?: ScriptBudget): Promise<ScriptOutput | null>;
  /** One deterministic run against the shared realm. Auto-boots defensively
   *  (that boot's output is then returned by the next `boot()` call).
   *  `budget` overrides the host default per run — the form pipeline slices
   *  ONE transaction-wide time budget across its K/V/C/F passes. */
  run(program: string, world: ScriptWorldInput, budget?: ScriptBudget): Promise<ScriptOutput>;
}

export interface ScriptHostOptions {
  sandboxFactory: ScriptSandboxFactory;
  document: () => ScriptDocumentInput;
  identity: () => ScriptIdentity;
  /** Deterministic environment per run; `sequence` is the host's monotonic
   *  run counter (seed derivation — see {@link seedFrom}). */
  environment: (sequence: number) => ScriptEnvironment;
  /** Name-tree programs, fetched lazily once per realm build. */
  bootSources: () => Promise<string[]>;
  budget?: ScriptBudget;
}

/**
 * The ONE realm per document (umbrella law #5): a name-tree function must be
 * callable from a page-open script and a field calculate alike.
 *
 * `transaction(body)` is the realm mutex, and the body performs EVERYTHING
 * for one logical script transaction — world prefetch, VM run(s), document
 * commits through the owner sinks, model reconciliation — BEFORE the mutex
 * releases, so the next transaction always prefetches post-commit truth
 * (the commit-inside-the-boundary law). Lock hierarchy: caller queues
 * (actions dispatch / form mutation) acquire this queue, never the reverse,
 * and commit sinks called inside the body never re-enter it.
 *
 * Fault ladder: a sandbox that reports itself disposed (interrupt/memory
 * faults) poisons the realm for the REST of the current transaction; the
 * next transaction rebuilds it lazily and re-runs the boot. Boot errors
 * degrade (diagnose, continue) — they never brick scripting.
 */
export interface ScriptHost {
  transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T>;
  dispose(): void;
}

/** FNV-1a over `documentId:sequence` — the deterministic default random seed
 *  (ported verbatim from the form controller; exported for callers building
 *  `ScriptHostOptions.environment`). */
export function seedFrom(documentId: string, sequence: number): number {
  let hash = 2166136261;
  for (const char of `${documentId}:${sequence}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Engine JWT/session identity composed under embedder overrides — the
 *  standard `ScriptHostOptions.identity` builder. */
export function resolveScriptIdentity(
  doc: DocumentHandle,
  overrides?: Partial<ScriptIdentity> | (() => Partial<ScriptIdentity>),
): ScriptIdentity {
  const claims = doc.security.identity;
  const supplied = typeof overrides === 'function' ? overrides() : (overrides ?? {});
  return {
    name: supplied.name ?? claims?.display_name ?? claims?.user_id ?? '',
    loginName: supplied.loginName ?? claims?.user_id ?? '',
    corporation: supplied.corporation ?? claims?.group_id ?? '',
    email: supplied.email ?? '',
  };
}

export function createScriptHost(options: ScriptHostOptions): ScriptHost {
  const budget = options.budget ?? DEFAULT_SCRIPT_BUDGET;

  // Deliberately NOT @embedpdf/core's createSerialQueue: this package is a
  // dependency-light leaf (engine-core types only) and must not pull the
  // kernel toolkit in. Identical contract, documented twin.
  let tail: Promise<void> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = tail.then(operation, operation);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  let sandboxPromise: Promise<ScriptSandbox> | null = null;
  let booted = false;
  let pendingBoot: ScriptOutput | null = null;
  let bootSourcesCache: Promise<string[]> | null = null;
  let sequence = 0;
  let disposed = false;

  const ensureSandbox = (): Promise<ScriptSandbox> => {
    sandboxPromise ??= options.sandboxFactory();
    return sandboxPromise;
  };

  const inputFor = (world: ScriptWorldInput): ScriptInput => ({
    document: {
      ...options.document(),
      ...(world.pageNumber !== undefined ? { pageNumber: world.pageNumber } : {}),
    },
    identity: options.identity(),
    environment: options.environment(sequence++),
    fields: world.fields,
    ...(world.annots ? { annots: world.annots } : {}),
    ...(world.annotPages ? { annotPages: world.annotPages } : {}),
    ...(world.annotsCoverDocument !== undefined
      ? { annotsCoverDocument: world.annotsCoverDocument }
      : {}),
    event: world.event,
  });

  /** A resource fault poisons the realm: rebuild + re-boot lazily NEXT time. */
  const noteFault = (sandbox: ScriptSandbox): void => {
    if (!sandbox.disposed) return;
    sandboxPromise = null;
    booted = false;
    pendingBoot = null;
  };

  const bootNow = async (
    world: ScriptWorldInput,
    runBudget?: ScriptBudget,
  ): Promise<ScriptOutput | null> => {
    if (booted) return null;
    // Degrade-never-brick: mark booted BEFORE running, exactly the
    // controller's law — a hostile boot script must not re-run per event.
    booted = true;
    const sandbox = await ensureSandbox();
    bootSourcesCache ??= options.bootSources();
    let sources: string[] = [];
    try {
      sources = await bootSourcesCache;
    } catch (error) {
      bootSourcesCache = null; // transient read failure — retry on rebuild
      // Degrade OBSERVABLY: a synthetic boot output carries the diagnostic
      // so the caller surfaces "the name tree could not even be read".
      return {
        event: { rc: true, value: null, change: '', selStart: 0, selEnd: 0 },
        formEffects: [],
        annotEffects: [],
        uiEffects: [],
        diagnostics: [
          {
            code: 'script-error',
            message: `Document boot script failed (continuing without it): ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
    if (sources.length === 0) return null;
    const output = sandbox.boot(
      sources,
      inputFor({ ...world, event: { kind: 'name-tree-boot' } }),
      runBudget ?? budget,
    );
    noteFault(sandbox);
    return output;
  };

  const runNow = async (
    program: string,
    world: ScriptWorldInput,
    runBudget?: ScriptBudget,
  ): Promise<ScriptOutput> => {
    if (!booted) {
      // Defensive auto-boot; the output waits for the next explicit boot().
      pendingBoot = await bootNow(world, runBudget);
    }
    const sandbox = await ensureSandbox();
    const output = sandbox.run(program, inputFor(world), runBudget ?? budget);
    noteFault(sandbox);
    return output;
  };

  return {
    transaction<T>(body: (txn: ScriptTransaction) => Promise<T>): Promise<T> {
      if (disposed) return Promise.reject(new Error('script host is disposed'));
      return enqueue(() =>
        body({
          boot: async (world, runBudget) => {
            if (pendingBoot) {
              const output = pendingBoot;
              pendingBoot = null;
              return output;
            }
            return bootNow(world, runBudget);
          },
          run: (program, world, runBudget) => runNow(program, world, runBudget),
        }),
      );
    },
    dispose() {
      disposed = true;
      const dying = sandboxPromise;
      sandboxPromise = null;
      booted = false;
      pendingBoot = null;
      void dying?.then((sandbox) => sandbox.dispose()).catch(() => undefined);
    },
  };
}

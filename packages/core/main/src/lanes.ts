import { PluginError, toPluginError } from './errors';
import type { OperationOptions } from './types';

/** One execution inside a `latest` lane. */
/** `details` of the `operation-cancelled` error a superseded or cancelled run rejects with. */
export interface LatestCancellation {
  readonly runId: string;
  /** `'superseded'`, `'cancelled'`, the caller's abort reason, or `'instance-closed'`. */
  readonly reason: string;
}

export interface LatestRun {
  /** `${lane}#${n}`, unique per run; surfaces in cancellation errors and events. */
  readonly id: string;
  /** Aborts when a newer run starts, the caller's signal aborts, or the instance closes. */
  readonly signal: AbortSignal;
  /** True once a newer run has started. */
  readonly superseded: boolean;
  /** Run `fn` only while this run is still the newest and alive; returns whether it ran. */
  commit(fn: () => void): boolean;
}

/**
 * Newest wins. Starting a run aborts the previous one; a superseded run cannot
 * publish (`commit` returns false) and its promise rejects
 * `operation-cancelled`, whatever its engine call later does.
 */
export interface LatestLane {
  readonly running: boolean;
  run<T>(fn: (run: LatestRun) => Promise<T>, options?: OperationOptions): Promise<T>;
  /** Cancel the current run, if any. */
  cancel(reason?: unknown): void;
}

export function createLatestLane(
  lifetime: AbortSignal,
  capability: string,
  name: string,
): LatestLane {
  let generation = 0;
  let active: AbortController | null = null;

  const closed = () => new PluginError('instance-closed', capability, `${name}: instance closed`);
  const cancelled = (id: string, why: string) =>
    new PluginError('operation-cancelled', capability, `${name}: ${why}`, {
      details: { runId: id, reason: why },
    });

  return {
    get running() {
      return active !== null;
    },
    cancel(reason) {
      active?.abort(reason ?? 'cancelled');
      active = null;
    },
    async run(fn, options) {
      if (lifetime.aborted) throw closed();
      if (options?.signal?.aborted)
        throw cancelled(`${name}#${generation + 1}`, 'cancelled before start');

      const mine = ++generation;
      const id = `${name}#${mine}`;
      const controller = new AbortController();
      const previous = active;
      active = controller; // install before aborting: abort listeners run synchronously
      const onLifetime = () => controller.abort('instance-closed');
      const onCaller = () => controller.abort('cancelled');
      lifetime.addEventListener('abort', onLifetime, { once: true });
      options?.signal?.addEventListener('abort', onCaller, { once: true });

      const current = () => mine === generation && !controller.signal.aborted;
      const run: LatestRun = {
        id,
        signal: controller.signal,
        get superseded() {
          return mine !== generation;
        },
        commit(commitFn) {
          if (!current()) return false;
          commitFn();
          return true;
        },
      };

      try {
        previous?.abort('superseded');
        if (!current()) throw cancelled(id, 'superseded');
        const value = await fn(run);
        if (!current()) throw cancelled(id, String(controller.signal.reason ?? 'superseded'));
        return value;
      } catch (error) {
        if (lifetime.aborted) throw closed();
        if (!current()) throw cancelled(id, String(controller.signal.reason ?? 'superseded'));
        throw toPluginError(capability, error);
      } finally {
        lifetime.removeEventListener('abort', onLifetime);
        options?.signal?.removeEventListener('abort', onCaller);
        if (active === controller) active = null;
      }
    },
  };
}

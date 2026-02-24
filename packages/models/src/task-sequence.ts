import { Task, TaskStage, TaskAbortedError, TaskRejectedError } from './task';

/**
 * Utility for composing sequential Task operations within an async function,
 * while preserving abort propagation and optional progress forwarding.
 *
 * Bridges the gap between the Task "push" model (callbacks, abort, progress)
 * and the async/await "pull" model, without losing Task benefits.
 *
 * @example
 * ```ts
 * function doWork(): Task<Result, MyError, MyProgress> {
 *   const task = new Task<Result, MyError, MyProgress>();
 *   const seq = new TaskSequence(task);
 *
 *   seq.execute(
 *     async () => {
 *       const data = await seq.run(() => fetchDataAsTask());
 *       const result = await seq.runWithProgress(
 *         () => processAsTask(data),
 *         (childProgress) => ({ stage: 'processing', ...childProgress }),
 *       );
 *       task.resolve(result);
 *     },
 *     (err) => ({ type: 'failed', message: String(err) }),
 *   );
 *
 *   return task;
 * }
 * ```
 *
 * @public
 */
export class TaskSequence<TError, TProgress> {
  private activeChild: Task<any, any, any> | null = null;
  private disposed = false;

  constructor(private parentTask: Task<any, TError, TProgress>) {
    const origAbort = parentTask.abort.bind(parentTask);
    parentTask.abort = (reason: TError) => {
      this.disposed = true;
      this.activeChild?.abort(reason);
      origAbort(reason);
    };
  }

  /**
   * Execute a child Task and return its result as a Promise.
   *
   * If the parent task has been aborted, throws `TaskAbortedError` immediately.
   * If the parent task is aborted while the child is running, the child is aborted too.
   */
  run<R>(factory: () => Task<R, any, any>): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (this.disposed || this.parentTask.state.stage !== TaskStage.Pending) {
        reject(new TaskAbortedError('Sequence aborted'));
        return;
      }

      const child = factory();
      this.activeChild = child;

      child.wait(
        (result) => {
          this.activeChild = null;
          resolve(result);
        },
        (error) => {
          this.activeChild = null;
          if (error.type === 'abort') {
            reject(new TaskAbortedError(error.reason));
          } else {
            reject(new TaskRejectedError(error.reason));
          }
        },
      );
    });
  }

  /**
   * Execute a child Task and return its result as a Promise,
   * forwarding the child's progress events to the parent task
   * through the provided mapper function.
   *
   * If the parent task has been aborted, throws `TaskAbortedError` immediately.
   * If the parent task is aborted while the child is running, the child is aborted too.
   */
  runWithProgress<R, CP>(
    factory: () => Task<R, any, CP>,
    mapProgress: (childProgress: CP) => TProgress,
  ): Promise<R> {
    return new Promise<R>((resolve, reject) => {
      if (this.disposed || this.parentTask.state.stage !== TaskStage.Pending) {
        reject(new TaskAbortedError('Sequence aborted'));
        return;
      }

      const child = factory();
      this.activeChild = child;

      child.onProgress((p) => {
        this.parentTask.progress(mapProgress(p));
      });

      child.wait(
        (result) => {
          this.activeChild = null;
          resolve(result);
        },
        (error) => {
          this.activeChild = null;
          if (error.type === 'abort') {
            reject(new TaskAbortedError(error.reason));
          } else {
            reject(new TaskRejectedError(error.reason));
          }
        },
      );
    });
  }

  /**
   * Execute an async function body that uses `run()` / `runWithProgress()`,
   * automatically handling abort and error routing to the parent task.
   *
   * - If the body throws `TaskAbortedError`, it is silently ignored
   *   (the parent task was already aborted via the abort override).
   * - If the body throws `TaskRejectedError` (from a child task rejection
   *   via `run()` / `runWithProgress()`), its `.reason` is forwarded directly
   *   to the parent task, bypassing `mapError`.
   * - Any other thrown error is mapped through `mapError` and used to
   *   reject the parent task. This handles unexpected runtime exceptions
   *   in the async body itself.
   * - On success, the body is responsible for calling `parentTask.resolve()`.
   */
  execute(fn: () => Promise<void>, mapError: (err: unknown) => TError): void {
    fn().catch((err) => {
      if (err instanceof TaskAbortedError) return;
      if (err instanceof TaskRejectedError) {
        this.parentTask.reject(err.reason as TError);
        return;
      }
      this.parentTask.reject(mapError(err));
    });
  }
}

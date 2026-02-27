/**
 * Stage of task
 *
 * @public
 */
export enum TaskStage {
  /**
   * Task is pending, means it just start executing
   */
  Pending = 0,
  /**
   * Task is succeed
   */
  Resolved = 1,
  /**
   * Task is failed
   */
  Rejected = 2,
  /**
   * Task is aborted
   */
  Aborted = 3,
}

export interface TaskError<D> {
  /**
   * task error type
   */
  type: 'reject' | 'abort';
  /**
   * task error
   */
  reason: D;
}

/**
 * callback that will be called when task is resolved
 *
 * @public
 */
export type ResolvedCallback<R> = (r: R) => void;

/**
 * callback that will be called when task is rejected
 *
 * @public
 */
export type RejectedCallback<D> = (e: TaskError<D>) => void;

/**
 * callback that will be called when task is progressing
 *
 * @public
 */
export type ProgressCallback<P> = (p: P) => void;

/**
 * Task state in different stage
 *
 * @public
 */
export type TaskState<R, D> =
  | {
      stage: TaskStage.Pending;
    }
  | {
      stage: TaskStage.Resolved;
      result: R;
    }
  | {
      stage: TaskStage.Rejected;
      reason: D;
    }
  | {
      stage: TaskStage.Aborted;
      reason: D;
    };

/**
 * Result type for allSettled
 *
 * @public
 */
export type TaskSettledResult<R, D> =
  | { status: 'resolved'; value: R }
  | { status: 'rejected'; reason: D }
  | { status: 'aborted'; reason: D };

export class TaskAbortedError<D> extends Error {
  public readonly reason: D;

  constructor(reason: D) {
    super(`Task aborted: ${JSON.stringify(reason)}`);
    this.name = 'TaskAbortedError';
    this.reason = reason;
  }
}

export class TaskRejectedError<D> extends Error {
  public readonly reason: D;

  constructor(reason: D) {
    super(`Task rejected: ${JSON.stringify(reason)}`);
    this.name = 'TaskRejectedError';
    this.reason = reason;
  }
}

/**
 * Base class of task
 *
 * @public
 */
export class Task<R, D, P = unknown> {
  state: TaskState<R, D> = {
    stage: TaskStage.Pending,
  };
  /**
   * callbacks that will be executed when task is resolved
   */
  resolvedCallbacks: ResolvedCallback<R>[] = [];
  /**
   * callbacks that will be executed when task is rejected
   */
  rejectedCallbacks: RejectedCallback<D>[] = [];

  /**
   * Promise that will be resolved when task is settled
   */
  private _promise: Promise<R> | null = null;

  /**
   * callbacks that will be executed when task is progressing
   */
  private progressCbs: ProgressCallback<P>[] = [];

  /**
   * Convert task to promise
   * @returns promise that will be resolved when task is settled
   */
  toPromise(): Promise<R> {
    if (!this._promise) {
      this._promise = new Promise((resolve, reject) => {
        this.wait(
          (result) => resolve(result),
          (error) => {
            if (error.type === 'abort') {
              reject(new TaskAbortedError(error.reason));
            } else {
              reject(new TaskRejectedError(error.reason));
            }
          },
        );
      });
    }
    return this._promise;
  }

  /**
   * wait for task to be settled
   * @param resolvedCallback - callback for resolved value
   * @param rejectedCallback - callback for rejected value
   */
  wait(resolvedCallback: ResolvedCallback<R>, rejectedCallback: RejectedCallback<D>) {
    switch (this.state.stage) {
      case TaskStage.Pending:
        this.resolvedCallbacks.push(resolvedCallback);
        this.rejectedCallbacks.push(rejectedCallback);
        break;
      case TaskStage.Resolved:
        resolvedCallback(this.state.result);
        break;
      case TaskStage.Rejected:
        rejectedCallback({
          type: 'reject',
          reason: this.state.reason,
        });
        break;
      case TaskStage.Aborted:
        rejectedCallback({
          type: 'abort',
          reason: this.state.reason,
        });
        break;
    }
  }

  /**
   * resolve task with specific result
   * @param result - result value
   */
  resolve(result: R) {
    if (this.state.stage === TaskStage.Pending) {
      this.state = {
        stage: TaskStage.Resolved,
        result,
      };
      for (const resolvedCallback of this.resolvedCallbacks) {
        try {
          resolvedCallback(result);
        } catch (e) {
          /* ignore */
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }

  /**
   * reject task with specific reason
   * @param reason - abort reason
   *
   */
  reject(reason: D) {
    if (this.state.stage === TaskStage.Pending) {
      this.state = {
        stage: TaskStage.Rejected,
        reason,
      };
      for (const rejectedCallback of this.rejectedCallbacks) {
        try {
          rejectedCallback({
            type: 'reject',
            reason,
          });
        } catch (e) {
          /*ignore */
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }

  /**
   * abort task with specific reason
   * @param reason - abort reason
   */
  abort(reason: D) {
    if (this.state.stage === TaskStage.Pending) {
      this.state = {
        stage: TaskStage.Aborted,
        reason,
      };
      for (const rejectedCallback of this.rejectedCallbacks) {
        try {
          rejectedCallback({
            type: 'abort',
            reason,
          });
        } catch (e) {
          /* ignore */
        }
      }
      this.resolvedCallbacks = [];
      this.rejectedCallbacks = [];
    }
  }

  /**
   * fail task with a TaskError from another task
   * This is a convenience method for error propagation between tasks
   * @param error - TaskError from another task
   */
  fail(error: TaskError<D>) {
    if (error.type === 'abort') {
      this.abort(error.reason);
    } else {
      this.reject(error.reason);
    }
  }

  /**
   * Transform the result of this task using a mapping function.
   * Returns a new Task that resolves with the mapped value.
   * Aborting the derived task also aborts the source task.
   *
   * @param fn - mapping function (may return a value or a Promise)
   * @returns a new Task that resolves with the mapped result
   */
  map<U>(fn: (result: R) => U | Promise<U>): Task<U, D> {
    const derived = new Task<U, D>();

    // Wire abort propagation: aborting derived aborts source
    const originalAbort = derived.abort.bind(derived);
    derived.abort = (reason: D) => {
      this.abort(reason);
      originalAbort(reason);
    };

    this.wait(
      (result) => {
        if (derived.state.stage !== TaskStage.Pending) return;
        try {
          const mapped = fn(result);
          if (mapped instanceof Promise) {
            mapped.then(
              (value) => {
                if (derived.state.stage === TaskStage.Pending) {
                  derived.resolve(value);
                }
              },
              (err) => {
                if (derived.state.stage === TaskStage.Pending) {
                  derived.reject(err);
                }
              },
            );
          } else {
            derived.resolve(mapped);
          }
        } catch (err) {
          if (derived.state.stage === TaskStage.Pending) {
            derived.reject(err as D);
          }
        }
      },
      (error) => {
        if (derived.state.stage === TaskStage.Pending) {
          derived.fail(error);
        }
      },
    );

    return derived;
  }

  /**
   * add a progress callback
   * @param cb - progress callback
   */
  onProgress(cb: ProgressCallback<P>) {
    this.progressCbs.push(cb);
  }

  /**
   * call progress callback
   * @param p - progress value
   */
  progress(p: P) {
    for (const cb of this.progressCbs) cb(p);
  }

  /**
   * Static method to wait for all tasks to resolve
   * Returns a new task that resolves with an array of all results
   * Rejects immediately if any task fails
   *
   * @param tasks - array of tasks to wait for
   * @returns new task that resolves when all input tasks resolve
   * @public
   */
  static all<R extends readonly Task<any, any>[]>(
    tasks: R,
  ): Task<{ [K in keyof R]: R[K] extends Task<infer U, any> ? U : never }, any> {
    type ResultType = { [K in keyof R]: R[K] extends Task<infer U, any> ? U : never };

    const combinedTask = new Task<ResultType, any>();

    if (tasks.length === 0) {
      combinedTask.resolve([] as any);
      return combinedTask;
    }

    const results: any[] = new Array(tasks.length);
    let resolvedCount = 0;
    let isSettled = false;

    tasks.forEach((task, index) => {
      task.wait(
        (result) => {
          if (isSettled) return;

          results[index] = result;
          resolvedCount++;

          if (resolvedCount === tasks.length) {
            isSettled = true;
            combinedTask.resolve(results as ResultType);
          }
        },
        (error) => {
          if (isSettled) return;

          isSettled = true;
          if (error.type === 'abort') {
            combinedTask.abort(error.reason);
          } else {
            combinedTask.reject(error.reason);
          }
        },
      );
    });

    return combinedTask;
  }

  /**
   * Static method to wait for all tasks to settle (resolve, reject, or abort)
   * Always resolves with an array of settlement results
   *
   * @param tasks - array of tasks to wait for
   * @returns new task that resolves when all input tasks settle
   * @public
   */
  static allSettled<R extends readonly Task<any, any>[]>(
    tasks: R,
  ): Task<
    { [K in keyof R]: R[K] extends Task<infer U, infer E> ? TaskSettledResult<U, E> : never },
    never
  > {
    type ResultType = {
      [K in keyof R]: R[K] extends Task<infer U, infer E> ? TaskSettledResult<U, E> : never;
    };

    const combinedTask = new Task<ResultType, never>();

    if (tasks.length === 0) {
      combinedTask.resolve([] as any);
      return combinedTask;
    }

    const results: any[] = new Array(tasks.length);
    let settledCount = 0;

    tasks.forEach((task, index) => {
      task.wait(
        (result) => {
          results[index] = { status: 'resolved', value: result };
          settledCount++;

          if (settledCount === tasks.length) {
            combinedTask.resolve(results as ResultType);
          }
        },
        (error) => {
          results[index] = {
            status: error.type === 'abort' ? 'aborted' : 'rejected',
            reason: error.reason,
          };
          settledCount++;

          if (settledCount === tasks.length) {
            combinedTask.resolve(results as ResultType);
          }
        },
      );
    });

    return combinedTask;
  }

  /**
   * Static method that resolves/rejects with the first task that settles
   *
   * @param tasks - array of tasks to race
   * @returns new task that settles with the first input task that settles
   * @public
   */
  static race<R extends readonly Task<any, any>[]>(
    tasks: R,
  ): Task<
    R[number] extends Task<infer U, any> ? U : never,
    R[number] extends Task<any, infer E> ? E : never
  > {
    type ResultType = R[number] extends Task<infer U, any> ? U : never;
    type ErrorType = R[number] extends Task<any, infer E> ? E : never;

    const combinedTask = new Task<ResultType, ErrorType>();

    if (tasks.length === 0) {
      combinedTask.reject('No tasks provided' as ErrorType);
      return combinedTask;
    }

    let isSettled = false;

    tasks.forEach((task) => {
      task.wait(
        (result) => {
          if (isSettled) return;
          isSettled = true;
          combinedTask.resolve(result);
        },
        (error) => {
          if (isSettled) return;
          isSettled = true;
          if (error.type === 'abort') {
            combinedTask.abort(error.reason);
          } else {
            combinedTask.reject(error.reason);
          }
        },
      );
    });

    return combinedTask;
  }

  /**
   * Utility to track progress of multiple tasks
   *
   * @param tasks - array of tasks to track
   * @param onProgress - callback called when any task completes
   * @returns new task that resolves when all input tasks resolve
   * @public
   */
  static withProgress<R extends readonly Task<any, any>[]>(
    tasks: R,
    onProgress?: (completed: number, total: number) => void,
  ): Task<{ [K in keyof R]: R[K] extends Task<infer U, any> ? U : never }, any> {
    const combinedTask = Task.all(tasks);

    if (onProgress) {
      let completedCount = 0;
      tasks.forEach((task) => {
        task.wait(
          () => {
            completedCount++;
            onProgress(completedCount, tasks.length);
          },
          () => {
            completedCount++;
            onProgress(completedCount, tasks.length);
          },
        );
      });
    }

    return combinedTask;
  }
}

/**
 * Type that represent the result of executing task
 */
export type TaskReturn<T extends Task<any, any>> =
  T extends Task<infer R, infer E>
    ? { type: 'result'; value: R } | { type: 'error'; value: TaskError<E> }
    : never;

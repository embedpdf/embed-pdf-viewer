import { Task, TaskError } from '@embedpdf/models';

export enum Priority {
  CRITICAL = 3,
  HIGH = 2,
  MEDIUM = 1,
  LOW = 0,
}

// ============================================================================
// Type Utilities
// ============================================================================

/**
 * Extract result type from Task
 */
export type ExtractTaskResult<T> = T extends Task<infer R, any, any> ? R : never;

/**
 * Extract error type from Task
 */
export type ExtractTaskError<T> = T extends Task<any, infer D, any> ? D : never;

/**
 * Extract progress type from Task
 */
export type ExtractTaskProgress<T> = T extends Task<any, any, infer P> ? P : never;

// ============================================================================
// Queue Interfaces
// ============================================================================

export interface QueuedTask<T extends Task<any, any, any>> {
  id: string;
  priority: Priority;
  meta?: Record<string, unknown>;
  executeFactory: () => T; // Factory function - called when it's time to execute!
  cancelled?: boolean;
}

export interface EnqueueOptions {
  priority?: Priority;
  meta?: Record<string, unknown>;
  fifo?: boolean;
}

export type TaskComparator = (a: QueuedTask<any>, b: QueuedTask<any>) => number;
export type TaskRanker = (task: QueuedTask<any>) => number;

export interface WorkerTaskQueueOptions {
  concurrency?: number;
  comparator?: TaskComparator;
  ranker?: TaskRanker;
  onIdle?: () => void;
  maxQueueSize?: number;
  autoStart?: boolean;
}

// ============================================================================
// WorkerTaskQueue - Corrected with Deferred Execution
// ============================================================================

export class WorkerTaskQueue {
  private queue: QueuedTask<any>[] = [];
  private running = 0;
  private resultTasks = new Map<string, Task<any, any, any>>();
  private visiblePages = new Map<number, number>();
  private opts: Required<Omit<WorkerTaskQueueOptions, 'comparator' | 'ranker'>> & {
    comparator?: TaskComparator;
    ranker?: TaskRanker;
  };

  constructor(options: WorkerTaskQueueOptions = {}) {
    const { concurrency = 1, comparator, ranker, onIdle, maxQueueSize, autoStart = true } = options;
    this.opts = {
      concurrency: Math.max(1, concurrency),
      comparator,
      ranker,
      onIdle: onIdle ?? (() => {}),
      maxQueueSize: maxQueueSize ?? Number.POSITIVE_INFINITY,
      autoStart,
    };
  }

  setComparator(comparator?: TaskComparator): void {
    this.opts.comparator = comparator;
  }

  setRanker(ranker?: TaskRanker): void {
    this.opts.ranker = ranker;
  }

  size(): number {
    return this.queue.length;
  }

  inFlight(): number {
    return this.running;
  }

  isIdle(): boolean {
    return this.queue.length === 0 && this.running === 0;
  }

  async drain(): Promise<void> {
    if (this.isIdle()) return;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.isIdle()) {
          this.offIdle(check);
          resolve();
        }
      };
      this.onIdle(check);
    });
  }

  private idleListeners = new Set<() => void>();
  private notifyIdle() {
    if (this.isIdle()) {
      [...this.idleListeners].forEach((fn) => fn());
      this.idleListeners.clear();
      this.opts.onIdle();
    }
  }
  private onIdle(fn: () => void) {
    this.idleListeners.add(fn);
  }
  private offIdle(fn: () => void) {
    this.idleListeners.delete(fn);
  }

  /**
   * Enqueue a task factory - with automatic type inference!
   *
   * The factory function is ONLY called when it's the task's turn to execute.
   *
   * Usage:
   *   const task = queue.enqueue({
   *     execute: () => this.executor.getMetadata(doc),  // Factory - not called yet!
   *     meta: { operation: 'getMetadata' }
   *   }, { priority: Priority.LOW });
   *
   * The returned task has the SAME type as executor.getMetadata() would return!
   */
  enqueue<T extends Task<any, any, any>>(
    taskDef: {
      execute: () => T; // Factory function that returns Task when called!
      meta?: Record<string, unknown>;
    },
    options: EnqueueOptions = {},
  ): T {
    const id = this.generateId();
    const priority = options.priority ?? Priority.MEDIUM;

    // Create a proxy task that we return to the user
    // This task bridges to the real task that will be created later
    const resultTask = new Task<
      ExtractTaskResult<T>,
      ExtractTaskError<T>,
      ExtractTaskProgress<T>
    >() as T;

    if (this.queue.length >= this.opts.maxQueueSize) {
      const error = new Error('Queue is full (maxQueueSize reached).');
      resultTask.reject(error as any);
      return resultTask;
    }

    // Store the result task for bridging
    this.resultTasks.set(id, resultTask);

    const queuedTask: QueuedTask<T> = {
      id,
      priority,
      meta: options.meta ?? taskDef.meta,
      executeFactory: taskDef.execute, // Store factory, don't call it yet!
    };

    this.queue.push(queuedTask);

    console.log(
      '[TaskQueue] Task enqueued:',
      id,
      '| Priority:',
      priority,
      '| Running:',
      this.running,
      '| Queued:',
      this.queue.length,
    );

    // Set up automatic abort handling
    // When result task is aborted externally, remove from queue
    const originalAbort = resultTask.abort.bind(resultTask);
    resultTask.abort = (reason: any) => {
      console.log('[TaskQueue] Task aborted:', id);
      this.cancel(id);
      originalAbort(reason);
    };

    if (this.opts.autoStart) this.process(options.fifo === true);

    return resultTask;
  }

  /**
   * Cancel/remove a task from the queue
   */
  private cancel(taskId: string): void {
    const before = this.queue.length;
    this.queue = this.queue.filter((t) => {
      if (t.id === taskId) {
        t.cancelled = true;
        return false;
      }
      return true;
    });

    this.resultTasks.delete(taskId);

    if (before !== this.queue.length) {
      console.log('[TaskQueue] Task cancelled and removed:', taskId);
      this.kick();
    }
  }

  private kick() {
    queueMicrotask(() => this.process());
  }

  private async process(fifo = false): Promise<void> {
    console.log(
      '[TaskQueue] process() called | Running:',
      this.running,
      '| Concurrency:',
      this.opts.concurrency,
      '| Queued:',
      this.queue.length,
    );

    while (this.running < this.opts.concurrency && this.queue.length > 0) {
      console.log(
        '[TaskQueue] Starting new task | Running:',
        this.running,
        '| Queued:',
        this.queue.length,
      );

      if (!fifo) this.sortQueue();

      const queuedTask = this.queue.shift()!;
      if (queuedTask.cancelled) {
        console.log('[TaskQueue] Skipping cancelled task:', queuedTask.id);
        continue;
      }

      const resultTask = this.resultTasks.get(queuedTask.id);
      if (!resultTask) continue; // Shouldn't happen, but guard anyway.

      this.running++;

      // NOW call the factory to create the real task!
      (async () => {
        let realTask: Task<any, any, any> | null = null;

        try {
          // Call the factory function NOW - this is when execution actually starts
          realTask = queuedTask.executeFactory();

          // Guard against null/undefined return from factory
          if (!realTask) {
            throw new Error('Task factory returned null/undefined');
          }

          // Bridge the real task to the result task
          realTask.wait(
            (result) => {
              if (resultTask.state.stage === 0 /* Pending */) {
                resultTask.resolve(result);
              }
            },
            (error) => {
              if (resultTask.state.stage === 0 /* Pending */) {
                if (error.type === 'abort') {
                  resultTask.abort(error.reason);
                } else {
                  resultTask.reject(error.reason);
                }
              }
            },
          );

          // Bridge progress
          realTask.onProgress((progress) => {
            resultTask.progress(progress);
          });

          // Wait for completion
          await realTask.toPromise();
        } catch (error) {
          // Handle any errors from factory or execution
          if (resultTask.state.stage === 0 /* Pending */) {
            resultTask.reject(error as any);
          }
        } finally {
          this.resultTasks.delete(queuedTask.id);
          this.running--;

          console.log(
            '[TaskQueue] Task completed:',
            queuedTask.id,
            '| Running:',
            this.running,
            '| Queued:',
            this.queue.length,
          );

          if (this.isIdle()) {
            this.notifyIdle();
          } else if (this.queue.length > 0) {
            this.kick();
          }
        }
      })().catch((error) => {
        console.error('[TaskQueue] Unhandled error in task execution wrapper:', error);
        this.running = Math.max(0, this.running - 1);
        if (this.isIdle()) {
          this.notifyIdle();
        } else if (this.queue.length > 0) {
          this.kick();
        }
      });
    }
  }

  private sortQueue(): void {
    const { comparator, ranker } = this.opts;
    if (comparator) {
      this.queue.sort(comparator);
      return;
    }

    const rankCache = new Map<string, number>();
    const getRank = (t: QueuedTask<any>) => {
      if (!ranker) return this.defaultRank(t);
      if (!rankCache.has(t.id)) rankCache.set(t.id, ranker(t));
      return rankCache.get(t.id)!;
    };

    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const ar = getRank(a);
      const br = getRank(b);
      if (ar !== br) return br - ar;
      return this.extractTime(a.id) - this.extractTime(b.id);
    });
  }

  private defaultRank(task: QueuedTask<any>): number {
    const pageIndex = task.meta?.pageIndex as number | undefined;
    if (pageIndex === undefined) return 0;

    const visibility = this.visiblePages.get(pageIndex) ?? 0;
    return visibility * 1000;
  }

  setVisiblePages(pages: Array<{ pageIndex: number; visibility: number }>): void {
    this.visiblePages.clear();
    for (const { pageIndex, visibility } of pages) {
      this.visiblePages.set(pageIndex, visibility);
    }
    if (this.queue.length > 0 && !this.opts.comparator) {
      this.sortQueue();
    }
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private extractTime(id: string): number {
    const t = Number(id.split('-')[0]);
    return Number.isFinite(t) ? t : 0;
  }
}

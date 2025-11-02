import { Task, TaskError } from '@embedpdf/models';

export enum Priority {
  CRITICAL = 3,
  HIGH = 2,
  MEDIUM = 1,
  LOW = 0,
}

export interface QueuedTask<T, P = unknown> {
  id: string;
  priority: Priority;
  // Arbitrary metadata you can use in your comparator/ranker
  meta?: Record<string, unknown>;
  // Your executor may optionally accept an AbortSignal for cooperative cancellation.
  // If you don't need it, just ignore the parameter.
  execute: ((signal: AbortSignal) => Promise<T>) | (() => Promise<T>);
  // Optional progress callback for the task
  onProgress?: (progress: P) => void;
  cancelled?: boolean;
}

export interface EnqueueOptions<T, P = unknown> {
  priority?: Priority;
  meta?: Record<string, unknown>;
  // Provide your own abort signal if you want to cancel in-flight work externally.
  signal?: AbortSignal;
  // If true, skip sorting and run strictly FIFO (still respects concurrency).
  fifo?: boolean;
  // Optional progress callback
  onProgress?: (progress: P) => void;
}

export interface TaskHandle<T, D = any, P = unknown> {
  id: string;
  task: Task<T, D, P>;
  cancel: () => void; // Cancels if queued; aborts if in-flight (cooperative).
}

type TaskResolver<T, D> = { task: Task<T, D>; signal: AbortSignal };

export type TaskComparator = (a: QueuedTask<any, any>, b: QueuedTask<any, any>) => number;

/**
 * A "ranker" maps a task to a numeric rank; higher is better.
 * The default comparator can use this rank along with priority.
 */
export type TaskRanker = (task: QueuedTask<any, any>) => number;

export interface WorkerTaskQueueOptions {
  concurrency?: number; // default 1
  // Use either comparator or ranker. If both provided, comparator wins.
  comparator?: TaskComparator;
  ranker?: TaskRanker;
  // Called whenever the queue transitions to idle (no queued or running tasks).
  onIdle?: () => void;
  // Maximum queued tasks (optional backpressure). Enqueue rejects if exceeded.
  maxQueueSize?: number;
  // Start processing automatically on enqueue (default true)
  autoStart?: boolean;
}

export class WorkerTaskQueue {
  private queue: QueuedTask<any, any>[] = [];
  private running = 0;
  private taskMap = new Map<string, TaskResolver<any, any>>();
  private controllers = new Map<string, AbortController>(); // per-task abort
  private visiblePages = new Map<number, number>(); // pageIndex -> visibility (0-1)
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

  /** Swap scheduling policy at runtime */
  setComparator(comparator?: TaskComparator): void {
    this.opts.comparator = comparator;
  }

  /** Swap ranker at runtime (used when no comparator is provided) */
  setRanker(ranker?: TaskRanker): void {
    this.opts.ranker = ranker;
  }

  /** How many tasks are queued (not running). */
  size(): number {
    return this.queue.length;
  }

  /** How many tasks are currently executing. */
  inFlight(): number {
    return this.running;
  }

  /** True when no tasks are queued or running. */
  isIdle(): boolean {
    return this.queue.length === 0 && this.running === 0;
  }

  /**
   * Resolve when the queue becomes idle (nothing queued or running).
   * Useful for tests or controlled flushes.
   */
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

  /** Lightweight idle listeners (not exposed publicly beyond drain). */
  private idleListeners = new Set<() => void>();
  private notifyIdle() {
    if (this.isIdle()) {
      // Fire one-shot callbacks
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

  enqueue<T, D = any, P = unknown>(
    taskDef: Omit<QueuedTask<T, P>, 'id' | 'priority'>,
    options: EnqueueOptions<T, P> = {},
  ): TaskHandle<T, D, P> {
    if (this.queue.length >= this.opts.maxQueueSize) {
      throw new Error('Queue is full (maxQueueSize reached).');
    }

    const id = this.generateId();
    const priority = options.priority ?? Priority.MEDIUM;
    const meta = options.meta;

    // Create a Task instance to return
    const resultTask = new Task<T, D, P>();

    // Per-task AbortController; if caller supplied a signal, tie them together
    const controller = new AbortController();
    if (options.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else {
        const onAbort = () => controller.abort(options.signal!.reason);
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
    }
    this.controllers.set(id, controller);

    // Store the task for resolution
    this.taskMap.set(id, { task: resultTask, signal: controller.signal });

    // If progress callback is provided, hook it up
    if (options.onProgress) {
      resultTask.onProgress(options.onProgress);
    }

    const queuedTask: QueuedTask<T, P> = {
      ...taskDef,
      id,
      priority,
      meta,
      onProgress: (progress: P) => resultTask.progress(progress),
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

    if (this.opts.autoStart) this.process(options.fifo === true);

    return {
      id,
      task: resultTask,
      cancel: () => this.cancel(id),
    };
  }

  /** Cancel if queued; abort if running (cooperative if executor honors AbortSignal). */
  private cancel(taskId: string): void {
    // Mark queued as cancelled + remove from queue
    const before = this.queue.length;
    this.queue = this.queue.filter((t) => {
      if (t.id === taskId) {
        t.cancelled = true;
        return false;
      }
      return true;
    });

    // Abort if in-flight
    const ctl = this.controllers.get(taskId);
    if (ctl && !ctl.signal.aborted) {
      ctl.abort('Cancelled');
    }

    const taskResolver = this.taskMap.get(taskId);
    if (taskResolver) {
      taskResolver.task.abort('Cancelled');
      this.taskMap.delete(taskId);
    }

    // If we removed something and there's capacity, keep processing.
    if (before !== this.queue.length) this.kick();
  }

  private kick() {
    // Schedule on microtask to batch bursts of enqueues/cancels.
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

      // Sort once per scheduling tick unless strict FIFO was requested.
      if (!fifo) this.sortQueue();

      const task = this.queue.shift()!;
      if (task.cancelled) {
        console.log('[TaskQueue] Skipping cancelled task:', task.id);
        continue;
      }

      const taskResolver = this.taskMap.get(task.id);
      if (!taskResolver) continue; // Shouldn't happen, but guard anyway.

      const controller = this.controllers.get(task.id)!;
      this.running++;

      (async () => {
        try {
          const exec = task.execute as any;
          const result = exec.length >= 1 ? await exec(controller.signal) : await exec();
          if (!controller.signal.aborted) {
            taskResolver.task.resolve(result);
          } else {
            taskResolver.task.abort(controller.signal.reason || 'Aborted');
          }
        } catch (error) {
          // If already aborted, surface that; otherwise the actual error.
          if (controller.signal.aborted) {
            taskResolver.task.abort(controller.signal.reason || 'Aborted');
          } else {
            taskResolver.task.reject(error);
          }
        } finally {
          this.controllers.delete(task.id);
          this.taskMap.delete(task.id);
          this.running--;

          // Log queue state for debugging
          console.log(
            '[TaskQueue] Task completed:',
            task.id,
            '| Running:',
            this.running,
            '| Queued:',
            this.queue.length,
          );

          if (this.isIdle()) {
            this.notifyIdle();
          } else if (this.queue.length > 0) {
            // Continue processing remaining tasks
            this.kick();
          }
        }
      })().catch(() => {
        // Defensive: ensure counters/finalizers run even if something odd happens.
        console.error('[TaskQueue] Unhandled error in task execution wrapper');
        this.running = Math.max(0, this.running - 1);
        if (this.isIdle()) {
          this.notifyIdle();
        } else if (this.queue.length > 0) {
          this.kick();
        }
      });
    }
  }

  /** Default sort: priority desc, then rank desc (if ranker), then FIFO by id time. */
  private sortQueue(): void {
    const { comparator, ranker } = this.opts;
    if (comparator) {
      this.queue.sort(comparator);
      return;
    }

    // Compute a rank only when needed (avoid re-ranking repeatedly).
    const rankCache = new Map<string, number>();
    const getRank = (t: QueuedTask<any, any>) => {
      if (!ranker) return this.defaultRank(t);
      if (!rankCache.has(t.id)) rankCache.set(t.id, ranker(t));
      return rankCache.get(t.id)!;
    };

    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      const ar = getRank(a);
      const br = getRank(b);
      if (ar !== br) return br - ar;
      // Stable-ish fallback using the timestamp embedded in id when using default generator
      return this.extractTime(a.id) - this.extractTime(b.id); // older first -> FIFO by enqueue order
    });
  }

  /**
   * Default ranker that considers page visibility
   * Higher visibility = higher rank
   */
  private defaultRank(task: QueuedTask<any, any>): number {
    const pageIndex = task.meta?.pageIndex as number | undefined;
    if (pageIndex === undefined) return 0;

    // Higher visibility = higher rank
    const visibility = this.visiblePages.get(pageIndex) ?? 0;

    // Scale visibility to a meaningful range (0-1000)
    // This works alongside priority sorting
    return visibility * 1000;
  }

  /**
   * Update visible pages from scroll plugin or viewport manager
   * This influences the ranking of tasks with pageIndex in their meta
   */
  setVisiblePages(pages: Array<{ pageIndex: number; visibility: number }>): void {
    this.visiblePages.clear();
    for (const { pageIndex, visibility } of pages) {
      this.visiblePages.set(pageIndex, visibility);
    }
    // Re-sort the queue if there are pending tasks
    if (this.queue.length > 0 && !this.opts.comparator) {
      this.sortQueue();
    }
  }

  private generateId(): string {
    // Prefer crypto UUID when available; fallback to time-random.
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private extractTime(id: string): number {
    // Works with our fallback id; UUIDs will just get 0 and remain stable among themselves.
    const t = Number(id.split('-')[0]);
    return Number.isFinite(t) ? t : 0;
  }
}

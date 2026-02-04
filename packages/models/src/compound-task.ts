import { Task, TaskError, TaskStage } from './task';

// ============================================================================
// CompoundTask - IMPROVED with Automatic Completion
// ============================================================================

/**
 * Configuration for how CompoundTask should aggregate results
 */
export interface CompoundTaskConfig<R, CR, P> {
  /**
   * How to aggregate child results into final result
   * Default: returns array of child results
   */
  aggregate?: (childResults: CR[]) => R;

  /**
   * Called when each child completes (for progress tracking)
   * Return progress value to emit
   */
  onChildComplete?: (completed: number, total: number, result: CR, index: number) => P | void;

  /**
   * Whether to fail immediately on first error
   * Default: true (like Promise.all)
   */
  failFast?: boolean;
}

/**
 * A task that manages multiple child tasks with automatic completion.
 *
 * Key features:
 * - Auto-resolves when all children complete
 * - Auto-aggregates results
 * - Auto-tracks progress
 * - Auto-cleans up completed children
 * - Propagates abort to all children
 */
export class CompoundTask<R, D, P = unknown> extends Task<R, D, P> {
  private children = new Map<Task<any, any, any>, number>(); // task -> index
  private childResults: any[] = [];
  private completedCount = 0;
  private expectedCount = 0;
  private config: Required<CompoundTaskConfig<R, any, P>>;
  private isFinalized = false;

  constructor(config: CompoundTaskConfig<R, any, P> = {}) {
    super();

    this.config = {
      aggregate: config.aggregate ?? ((results) => results as any),
      onChildComplete: config.onChildComplete ?? (() => {}),
      failFast: config.failFast ?? true,
    };
  }

  /**
   * Add a child task - automatically wires up completion handling
   */
  addChild<CR>(child: Task<CR, any, any>, index?: number): this {
    // If already settled, abort the child
    if (this.state.stage !== TaskStage.Pending) {
      if (this.state.stage === TaskStage.Aborted) {
        child.abort(this.state.reason as any);
      }
      return this;
    }

    const childIndex = index ?? this.expectedCount;
    this.expectedCount = Math.max(this.expectedCount, childIndex + 1);

    this.children.set(child, childIndex);

    // Wire up automatic completion handling
    child.wait(
      (result) => this.handleChildSuccess(child, result, childIndex),
      (error) => this.handleChildError(child, error, childIndex),
    );

    return this; // Fluent API
  }

  /**
   * Finalize - signals that no more children will be added
   * If no children were added, resolves immediately
   */
  finalize(): this {
    if (this.isFinalized) return this;
    this.isFinalized = true;

    // If no children, resolve immediately with empty result
    if (this.expectedCount === 0) {
      this.resolve(this.config.aggregate([]) as R);
    }

    return this;
  }

  private handleChildSuccess(child: Task<any, any, any>, result: any, index: number): void {
    if (this.state.stage !== TaskStage.Pending) return;

    // Store result
    this.childResults[index] = result;
    this.completedCount++;

    // Clean up child reference
    this.children.delete(child);

    // Emit progress
    const progressValue = this.config.onChildComplete(
      this.completedCount,
      this.expectedCount,
      result,
      index,
    );
    if (progressValue !== undefined) {
      this.progress(progressValue as P);
    }

    // Check if all complete
    if (this.completedCount === this.expectedCount) {
      const finalResult = this.config.aggregate(this.childResults);
      this.resolve(finalResult as R);
    }
  }

  private handleChildError(child: Task<any, any, any>, error: TaskError<any>, index: number): void {
    if (this.state.stage !== TaskStage.Pending) return;

    this.children.delete(child);

    if (this.config.failFast) {
      // Abort all other children
      for (const [otherChild] of this.children) {
        otherChild.abort('Sibling task failed' as any);
      }
      this.children.clear();

      // Fail the compound task
      this.fail(error as TaskError<D>);
    } else {
      // Continue, treating error as undefined result
      this.childResults[index] = undefined;
      this.completedCount++;

      // Check if all complete (including failures)
      if (this.completedCount === this.expectedCount) {
        const finalResult = this.config.aggregate(this.childResults);
        this.resolve(finalResult as R);
      }
    }
  }

  /**
   * Override abort to propagate to all children
   */
  override abort(reason: D): void {
    for (const [child] of this.children) {
      child.abort(reason as any);
    }
    this.children.clear();
    super.abort(reason);
  }

  /**
   * Override reject to abort all children
   */
  override reject(reason: D): void {
    for (const [child] of this.children) {
      child.abort(reason as any);
    }
    this.children.clear();
    super.reject(reason);
  }

  /**
   * Get count of pending children
   */
  getPendingCount(): number {
    return this.children.size;
  }

  /**
   * Get count of completed children
   */
  getCompletedCount(): number {
    return this.completedCount;
  }

  // ============================================================================
  // Static Factory Methods
  // ============================================================================

  /**
   * Gather results from an array of tasks (progress-friendly).
   * (Formerly: all)
   */
  static gather<T extends Task<any, any, any>>(
    tasks: T[],
  ): CompoundTask<
    { [K in keyof T]: T[K] extends Task<infer R, any, any> ? R : never }[],
    any,
    { completed: number; total: number }
  > {
    type ResultType = { [K in keyof T]: T[K] extends Task<infer R, any, any> ? R : never }[];

    const compound = new CompoundTask<ResultType, any, { completed: number; total: number }>({
      aggregate: (results) => results as ResultType,
      onChildComplete: (completed, total) => ({ completed, total }),
    });

    tasks.forEach((task, index) => compound.addChild(task, index));
    compound.finalize();
    return compound;
  }

  /**
   * Gather into a Record indexed by number.
   * (Formerly: allIndexed)
   */
  static gatherIndexed<R, D>(
    tasks: Task<R, D, any>[],
  ): CompoundTask<Record<number, R>, D, { page: number; result: R }> {
    const compound = new CompoundTask<Record<number, R>, D, { page: number; result: R }>({
      aggregate: (results) => {
        const record: Record<number, R> = {};
        results.forEach((result, index) => {
          record[index] = result;
        });
        return record;
      },
      onChildComplete: (_completed, _total, result, index) => ({ page: index, result }),
    });

    tasks.forEach((task, index) => compound.addChild(task, index));
    compound.finalize();
    return compound;
  }

  /**
   * Gather with custom aggregation config.
   * (Formerly: from)
   */
  static gatherFrom<R, CR, D, P>(
    tasks: Task<CR, D, any>[],
    config: CompoundTaskConfig<R, CR, P>,
  ): CompoundTask<R, D, P> {
    const compound = new CompoundTask<R, D, P>(config);
    tasks.forEach((task, index) => compound.addChild(task, index));
    compound.finalize();
    return compound;
  }

  /**
   * Resolve with the first successful child; abort the rest.
   * (Formerly: race)
   */
  static first<T extends Task<any, any, any>>(
    tasks: T[],
  ): CompoundTask<
    T extends Task<infer R, any, any> ? R : never,
    T extends Task<any, infer D, any> ? D : never,
    unknown
  > {
    type ResultType = T extends Task<infer R, any, any> ? R : never;
    type ErrorType = T extends Task<any, infer D, any> ? D : never;

    let resolved = false;

    const compound = new CompoundTask<ResultType, ErrorType, unknown>({
      aggregate: (results) => results[0] as ResultType,
      failFast: false,
    });

    // Resolve immediately on first success; abort siblings
    compound['handleChildSuccess'] = (child: Task<any, any, any>, result: any) => {
      if (!resolved) {
        resolved = true;
        for (const [otherChild] of (compound as any)['children']) {
          if (otherChild !== child) otherChild.abort('Race won by sibling' as any);
        }
        compound.resolve(result as ResultType);
      }
    };

    tasks.forEach((task, index) => compound.addChild(task, index));
    compound.finalize();
    return compound;
  }
}

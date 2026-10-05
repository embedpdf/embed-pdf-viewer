/**
 * Priority levels for the WorkerQueue. Higher number = served first.
 * Levels are spaced 100 apart so new ones can slot in between without
 * re-indexing.
 */
export const Priority = {
  LOW: 0,
  MEDIUM: 100,
  /**
   * Page renders: after the writes and opens a caller waits on (a scroll's
   * renders never hold up an edit), before reads. A render's own priority
   * orders renders among themselves, as the job's rank.
   */
  RENDER: 150,
  HIGH: 200,
  CRITICAL: 300,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

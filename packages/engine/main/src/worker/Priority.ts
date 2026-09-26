/**
 * Priority levels for the WorkerQueue. Higher number = served first.
 * Levels are spaced 100 apart so new ones can slot in between without
 * re-indexing.
 */
export const Priority = {
  LOW: 0,
  MEDIUM: 100,
  HIGH: 200,
  CRITICAL: 300,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

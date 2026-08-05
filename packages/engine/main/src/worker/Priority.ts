/**
 * Priority levels for the WorkerQueue. Higher number = served first.
 * Wider range than v2 to leave room for future additions (idle, foreground,
 * critical) without re-indexing.
 */
export const Priority = {
  LOW: 0,
  MEDIUM: 100,
  HIGH: 200,
  CRITICAL: 300,
} as const;

export type Priority = (typeof Priority)[keyof typeof Priority];

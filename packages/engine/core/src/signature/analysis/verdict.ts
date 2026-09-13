import type { StepVerdict } from './types';

const RANK: Record<StepVerdict, number> = {
  unchanged: 0,
  permitted: 1,
  indeterminate: 2,
  forbidden: 3,
};

/** The verdict of a whole analysis: its worst step. */
export function worstVerdict(steps: ReadonlyArray<{ verdict: StepVerdict }>): StepVerdict {
  let worst: StepVerdict = 'unchanged';
  for (const s of steps) if (RANK[s.verdict] > RANK[worst]) worst = s.verdict;
  return worst;
}

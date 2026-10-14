/**
 * "Did you mean …?" for ids: the closest known id to one that doesn't exist,
 * by edit distance, when it is close enough to be a typo.
 */

/**
 * The number of single-character inserts, deletes, substitutions and swaps of two neighbours
 * that turn `left` into `right`.
 */
export function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  let beforePrevious: number[] = [];
  let previous = Array.from({ length: right.length + 1 }, (_, j) => j);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      let distance = Math.min(previous[j]! + 1, current[j - 1]! + 1, previous[j - 1]! + cost);
      if (i > 1 && j > 1 && left[i - 1] === right[j - 2] && left[i - 2] === right[j - 1]) {
        distance = Math.min(distance, beforePrevious[j - 2]! + 1);
      }
      current.push(distance);
    }
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length]!;
}

/**
 * The candidate closest to `id`, or `null` when none is within a typo's reach: at most a third
 * of the id's length, and never more than 3 edits apart.
 */
export function closestMatch(id: string, candidates: Iterable<string>): string | null {
  const reach = Math.min(3, Math.max(1, Math.floor(id.length / 3)));
  let best: string | null = null;
  let bestDistance = reach + 1;
  for (const candidate of candidates) {
    if (candidate === id) continue;
    const distance = editDistance(id, candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** `' (did you mean "x"?)'` for the closest candidate, or `''` when there is none. */
export function didYouMean(id: string, candidates: Iterable<string>): string {
  const match = closestMatch(id, candidates);
  return match === null ? '' : ` (did you mean "${match}"?)`;
}

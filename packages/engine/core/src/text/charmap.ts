import type { PageTextSnapshot } from '../dto/PageTextSnapshot';

/**
 * Character↔text index translation — the ONE place the two text index
 * spaces of a page meet.
 *
 * A page has two index spaces:
 *
 *   - CHARACTER space: PDFium's internal character list, the space geometry
 *     runs tile (`PageGeometryRun.charStart`), hit-testing addresses, and
 *     selection ranges live in. Size: `PageTextSnapshot.charCount`.
 *   - TEXT space: UTF-16 code-unit offsets into the extracted string
 *     `PageTextSnapshot.text` — what search matching and slicing operate on.
 *
 * They diverge in exactly two ways, both encoded by `charMap` anchors:
 *   - a non-printing character occupies a character slot but contributes
 *     ZERO text units (PDFium's `char_indices_` skip list);
 *   - a supplementary-plane character contributes TWO text units (a
 *     surrogate pair) once extraction is UTF-16-faithful.
 *
 * `charMap` semantics (see {@link CharMapAnchor}): an implicit head anchor
 * `[0, 0]`; between anchors every character advances the text by exactly one
 * unit; an anchor sits at `i + 1` whenever character `i` contributed
 * something other than one unit. Absent/empty map = identity
 * (`charCount === text.length`). `charMapViolation` is the validator both
 * the wire schema and engine builders share — malformed maps are rejected,
 * never silently repaired.
 *
 * Boundary model: a "character boundary" `c` ∈ [0, charCount] sits BEFORE
 * character `c`; `boundaryTextOffset(s, charCount) === text.length` always.
 * All ranges are half-open in both spaces.
 */

/**
 * One anchor of the character→text mapping: from character index `char`
 * onward (until the next anchor), boundary `c` maps to text offset
 * `text + (c - char)`.
 */
export type CharMapAnchor = readonly [char: number, text: number];

/** Direction to resolve a text offset that falls on a zero-width plateau —
 *  see {@link charBoundaryAtTextOffset}. */
export type CharBoundaryBias = 'start' | 'end';

const clampInt = (value: number, lo: number, hi: number): number =>
  Math.min(Math.max(Math.floor(value), lo), hi);

/** The greatest anchor with `anchor.char <= boundary` (implicit head [0,0]). */
function anchorAtOrBefore(map: ReadonlyArray<CharMapAnchor>, boundary: number): CharMapAnchor {
  let lo = 0;
  let hi = map.length - 1;
  let best: CharMapAnchor | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (map[mid][0] <= boundary) {
      best = map[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best ?? [0, 0];
}

/**
 * Text offset of character boundary `boundary` (clamped into
 * [0, charCount]). For a dropped character this is the offset of the next
 * real text unit — exactly what half-open slicing needs at either end.
 */
export function boundaryTextOffset(snapshot: PageTextSnapshot, boundary: number): number {
  const b = clampInt(boundary, 0, snapshot.charCount);
  const map = snapshot.charMap;
  if (!map || map.length === 0) return Math.min(b, snapshot.text.length);
  const [char, text] = anchorAtOrBefore(map, b);
  return text + (b - char);
}

/**
 * The character boundary for a text offset, with explicit plateau bias:
 *
 *   - `'start'`: the GREATEST boundary whose text offset is <= `offset` —
 *     scans forward past zero-width characters, so a range start never
 *     includes a dropped character that precedes its first real unit.
 *   - `'end'`: the SMALLEST boundary whose text offset is >= `offset` —
 *     stops before zero-width characters, so a range end never swallows a
 *     dropped character that follows its last real unit.
 *
 * An offset inside a surrogate pair resolves outward under both biases
 * (start → the pair's character, end → past it), so a clipped astral
 * character is always covered whole. Prefer {@link charRangeForTextOffsets}
 * — the two biases exist to be used as a PAIR.
 */
export function charBoundaryAtTextOffset(
  snapshot: PageTextSnapshot,
  offset: number,
  bias: CharBoundaryBias,
): number {
  const target = clampInt(offset, 0, snapshot.text.length);
  let lo = 0;
  let hi = snapshot.charCount;
  if (bias === 'start') {
    // Greatest boundary with B(boundary) <= target. B(0) = 0 <= target always.
    while (lo < hi) {
      const mid = lo + Math.ceil((hi - lo) / 2);
      if (boundaryTextOffset(snapshot, mid) <= target) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  // Smallest boundary with B(boundary) >= target. B(charCount) = text.length
  // >= target always (offset is clamped).
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (boundaryTextOffset(snapshot, mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/**
 * The character range whose text projection is exactly
 * `text.slice(startOffset, endOffset)` — THE inverse used by search-hit
 * conversion and select-by-text. Start is right-biased and end left-biased
 * (see {@link charBoundaryAtTextOffset}), so zero-width characters adjacent
 * to the range fall OUTSIDE it on both sides.
 *
 * A non-empty text range can never invert: `end > start` implies
 * `B(end) >= endOffset > startOffset >= B(start)`, which forces
 * `end > start` by monotonicity. Empty input (`endOffset <= startOffset`)
 * normalizes to the end-rule boundary of `startOffset` on both sides.
 */
export function charRangeForTextOffsets(
  snapshot: PageTextSnapshot,
  startOffset: number,
  endOffset: number,
): { start: number; end: number } {
  if (endOffset <= startOffset) {
    const b = charBoundaryAtTextOffset(snapshot, startOffset, 'end');
    return { start: b, end: b };
  }
  return {
    start: charBoundaryAtTextOffset(snapshot, startOffset, 'start'),
    end: charBoundaryAtTextOffset(snapshot, endOffset, 'end'),
  };
}

/**
 * THE copy primitive: the text projection of the half-open character range
 * `[charStart, charEnd)`. Dropped characters inside the range contribute
 * nothing; a supplementary character contributes its full surrogate pair.
 * `sliceTextByChars(s, 0, s.charCount) === s.text` always.
 */
export function sliceTextByChars(
  snapshot: PageTextSnapshot,
  charStart: number,
  charEnd: number,
): string {
  if (charEnd <= charStart) return '';
  return snapshot.text.slice(
    boundaryTextOffset(snapshot, charStart),
    boundaryTextOffset(snapshot, charEnd),
  );
}

/**
 * First invariant violation of a snapshot's char map, or null when valid.
 * Shared by the wire schema (rejects malformed bodies) and engine builders
 * (dev-mode assertion). The invariants:
 *
 *   1. absent/empty map ⇒ identity, so `charCount === text.length`;
 *   2. anchor chars strictly increasing, each in [1, charCount];
 *   3. step rule: against the previous anchor (implicit head [0, 0]), the
 *      character just before each anchor contributed exactly 0 units
 *      (dropped) or 2 (surrogate pair):
 *      `t₂ - (t₁ + (c₂ - c₁ - 1)) ∈ {0, 2}`;
 *   4. tail: `lastText + (charCount - lastChar) === text.length`
 *      (equivalently `boundaryTextOffset(s, charCount) === text.length`).
 */
export function charMapViolation(
  charCount: number,
  textLength: number,
  charMap: ReadonlyArray<CharMapAnchor> | undefined,
): string | null {
  if (!charMap || charMap.length === 0) {
    return charCount === textLength
      ? null
      : `identity map requires charCount (${charCount}) === text length (${textLength})`;
  }
  let prevChar = 0;
  let prevText = 0;
  for (let i = 0; i < charMap.length; i++) {
    const [char, text] = charMap[i];
    if (!Number.isInteger(char) || !Number.isInteger(text)) {
      return `anchor ${i} is not integer-valued`;
    }
    if (char <= prevChar) {
      return `anchor ${i} char ${char} not strictly after ${prevChar}`;
    }
    if (char > charCount) {
      return `anchor ${i} char ${char} outside [1, ${charCount}]`;
    }
    const step = text - (prevText + (char - prevChar - 1));
    if (step !== 0 && step !== 2) {
      return `anchor ${i} implies a character contributing ${step} text units (expected 0 or 2)`;
    }
    prevChar = char;
    prevText = text;
  }
  const tail = prevText + (charCount - prevChar);
  if (tail !== textLength) {
    return `map projects charCount to ${tail}, but text length is ${textLength}`;
  }
  return null;
}

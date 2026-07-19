import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';
import { NO_ANNOTATION_FLAGS } from '@embedpdf/engine-core/runtime';

/**
 * Bit positions of the `/F` (Annotation Flags) entry per ISO 32000 §12.5.3.
 * The single source of truth shared by the flag reader and writer so they
 * can never drift apart.
 */
export const ANNOT_FLAG_BITS = {
  invisible: 1 << 0,
  hidden: 1 << 1,
  print: 1 << 2,
  noZoom: 1 << 3,
  noRotate: 1 << 4,
  noView: 1 << 5,
  readOnly: 1 << 6,
  locked: 1 << 7,
  toggleNoView: 1 << 8,
  lockedContents: 1 << 9,
} as const satisfies Record<keyof AnnotationFlags, number>;

const FLAG_KEYS = Object.keys(ANNOT_FLAG_BITS) as (keyof AnnotationFlags)[];

/** Expand a raw `/F` bitset into the typed boolean object. */
export function bitsToFlags(bits: number): AnnotationFlags {
  if (bits === 0) return { ...NO_ANNOTATION_FLAGS };
  const flags = { ...NO_ANNOTATION_FLAGS };
  for (const key of FLAG_KEYS) {
    flags[key] = (bits & ANNOT_FLAG_BITS[key]) !== 0;
  }
  return flags;
}

/**
 * Fold a partial flag patch onto an existing `/F` bitset. Only keys present
 * in `partial` are touched; absent keys preserve their current bit. This is
 * what lets `create` start from 0 and `update` merge onto the live value.
 */
export function flagsToBits(current: number, partial: Partial<AnnotationFlags>): number {
  let bits = current;
  for (const key of FLAG_KEYS) {
    const value = partial[key];
    if (value === undefined) continue;
    if (value) {
      bits |= ANNOT_FLAG_BITS[key];
    } else {
      bits &= ~ANNOT_FLAG_BITS[key];
    }
  }
  return bits;
}

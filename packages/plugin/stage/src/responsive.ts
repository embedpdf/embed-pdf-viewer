import type { Size } from '@embedpdf/core-stage';
import type { BoxQuery, ResponsiveRule, StageBox, StageSettings } from './types';

/**
 * Container queries for the settings bag — the pure half. The capability owns
 * the driver (when to re-resolve, how to react); the LAWS live here: what a
 * box is, when a query matches, and what the effective settings are. No state,
 * no dispatch — property-testable in isolation (the `wheel.ts` convention).
 *
 * The query vocabulary is deliberately just the box: a headless, DOM-free
 * stage knows exactly one environmental fact — the viewport it was told.
 * Anything else (pointer coarseness, platform, app state) is either per-event
 * (`PointerSample.pointerType`) or the app's own business via `update()`.
 */

/** The reported viewport as a queryable box. A square box is 'portrait' (CSS). */
export const boxOf = (vp: Size): StageBox => ({
  width: vp.width,
  height: vp.height,
  orientation: vp.height >= vp.width ? 'portrait' : 'landscape',
});

/** All bounds inclusive, all fields optional, conditions AND-ed (CSS ranges). */
export const matchesQuery = (q: BoxQuery, box: StageBox): boolean =>
  (q.minWidth === undefined || box.width >= q.minWidth) &&
  (q.maxWidth === undefined || box.width <= q.maxWidth) &&
  (q.minHeight === undefined || box.height >= q.minHeight) &&
  (q.maxHeight === undefined || box.height <= q.maxHeight) &&
  (q.orientation === undefined || box.orientation === q.orientation);

const ruleMatches = (rule: ResponsiveRule, box: StageBox): boolean =>
  typeof rule.when === 'function' ? !!rule.when(box) : matchesQuery(rule.when, box);

/** Merge a patch over settings, skipping undefined values (Partial semantics). */
export const mergeSettings = (into: StageSettings, patch: Partial<StageSettings>): StageSettings => {
  const out = { ...into };
  let key: keyof StageSettings;
  for (key in patch) {
    const value = patch[key];
    if (value !== undefined) Object.assign(out, { [key]: value });
  }
  return out;
};

/**
 * Setting-value equality: primitives by identity, the flat objects the
 * settings vocabulary uses (`{ px }`, `{ x, y }`, page frames, zoom specs) by
 * one level of own-key comparison. Settings values are never nested deeper.
 */
export const eqSetting = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k])
  );
};

export interface ResolvedResponsive {
  /** base ⊕ every matching rule's patch, in source order (later wins per key). */
  effective: StageSettings;
  /** Names of the matching rules, in source order. */
  active: string[];
}

export const resolveResponsive = (
  base: StageSettings,
  rules: readonly ResponsiveRule[],
  box: StageBox,
): ResolvedResponsive => {
  let effective = base;
  const active: string[] = [];
  for (const rule of rules) {
    if (!ruleMatches(rule, box)) continue;
    if (rule.name !== undefined) active.push(rule.name);
    if (rule.settings) effective = mergeSettings(effective, rule.settings);
  }
  return { effective, active };
};

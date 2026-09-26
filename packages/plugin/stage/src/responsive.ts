import type { Size } from '@embedpdf/core-stage';
import type { BoxQuery, ResponsiveRule, StageBox, StageSettings } from './contract';

/**
 * Container queries for the settings bag, the pure half. The capability owns
 * the driver (when to re-resolve, how to react); the laws live here: what a
 * box is, when a query matches, and what the effective settings are. No
 * state, so they are property-testable in isolation.
 *
 * The query vocabulary is only the box: a headless, DOM-free stage knows
 * exactly one environmental fact, the viewport it was told. Anything else
 * (pointer coarseness, platform, app state) is either per event
 * (`PointerSample.pointerType`) or the app's own business via
 * `updateSettings()`.
 */

/** The reported viewport as a queryable box. A square box is 'portrait' (CSS). */
export const boxOf = (size: Size): StageBox => ({
  width: size.width,
  height: size.height,
  orientation: size.height >= size.width ? 'portrait' : 'landscape',
});

/** All bounds inclusive, all fields optional, every condition must hold (CSS ranges). */
export const matchesQuery = (query: BoxQuery, box: StageBox): boolean =>
  (query.minWidth === undefined || box.width >= query.minWidth) &&
  (query.maxWidth === undefined || box.width <= query.maxWidth) &&
  (query.minHeight === undefined || box.height >= query.minHeight) &&
  (query.maxHeight === undefined || box.height <= query.maxHeight) &&
  (query.orientation === undefined || box.orientation === query.orientation);

const ruleMatches = (rule: ResponsiveRule, box: StageBox): boolean =>
  typeof rule.when === 'function' ? !!rule.when(box) : matchesQuery(rule.when, box);

/** Merge a patch over settings, skipping undefined values (Partial semantics). */
export const mergeSettings = (
  into: StageSettings,
  patch: Partial<StageSettings>,
): StageSettings => {
  const merged = { ...into };
  let key: keyof StageSettings;
  for (key in patch) {
    const value = patch[key];
    if (value !== undefined) Object.assign(merged, { [key]: value });
  }
  return merged;
};

/**
 * Setting-value equality: primitives by identity, the flat objects the
 * settings vocabulary uses (`{ px }`, `{ x, y }`, page frames, zoom specs) by
 * one level of own-key comparison. Settings values are never nested deeper.
 */
export const eqSetting = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;
  if (typeof left !== 'object' || typeof right !== 'object' || left === null || right === null) {
    return false;
  }
  const leftKeys = Object.keys(left);
  return (
    leftKeys.length === Object.keys(right).length &&
    leftKeys.every(
      (key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key],
    )
  );
};

export interface ResolvedResponsive {
  /** The base merged with every matching rule's patch, in source order (later wins per key). */
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

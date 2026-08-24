import type { EngineRenderPolicy, PageImageOptions } from '@embedpdf/core';

import type { ResolvedRenderOptions } from './paint-plan';

/** Encoded formats the strategy may request (the engine's own union). */
export type RenderFormat = NonNullable<PageImageOptions['format']>;

/**
 * The render points a document actually uses — POLICY ∧ STRATEGY, resolved
 * once per (policy, options) pair.
 *
 * Policy is an engine fact (what the deployment serves and caches); strategy
 * is a plugin decision (what the viewer spends, and which points it renders
 * when the engine permits anything). The one rule, applied three times:
 * a strategy value applies as written under `continuous`, and conforms to
 * the advertised lattice when there is one — so `quantize: 'exact'` or
 * `format: 'bmp'` run unchanged against cloud with no branches in client
 * code.
 *
 *   - `widths: null`  → base renders the EXACT settled demand, capped at
 *     `maxWidth` (the local default — resting pixels are never resampled,
 *     which is the only way ~1px text stems stay crisp on dpr-1 screens).
 *   - `widths: [...]` → base snaps UP the rung list (an advertised lattice,
 *     or the opt-in client ladder), capped by `maxWidth`.
 *   - `pyramid` mirrors the same split for tile levels.
 */
export interface ResolvedStrategy {
  /** Base render points; null = exact-up-to-budget. */
  readonly widths: readonly number[] | null;
  /** The budget: no full-page raster is ever wider (device px). */
  readonly maxWidth: number;
  /** Tile levels (device px per point); null = exact scale at rest. */
  readonly pyramid: readonly number[] | null;
  /** Tile edge in device px (policy tileSizes win when advertised). */
  readonly tileSize: number;
  /** Sharpness deficit above which tiles engage. Resolved default: 1.0 when
   *  the base is exact (nothing may rest stretched), 1.25 under a lattice
   *  (rungs make the band cheap and CSS ≤1.25× upscale reads fine). */
  readonly engageAt: number;
  /** Exact-mode tile-level safety clamp (device px per point). */
  readonly tileMaxScale: number;
  /** Encode format for BOTH planes, policy-conformed. Undefined = engine default. */
  readonly format?: RenderFormat;
  readonly quality?: number;
}

const ascending = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

/** Rung list capped by the budget — always keeps at least the smallest rung. */
const capWidths = (widths: readonly number[], maxWidth: number): readonly number[] => {
  const sorted = ascending(widths);
  const kept = sorted.filter((w) => w <= maxWidth);
  return kept.length ? kept : sorted.slice(0, 1);
};

export function resolveStrategy(
  policy: EngineRenderPolicy,
  options: ResolvedRenderOptions,
): ResolvedStrategy {
  const lattice = policy.kind === 'lattice';

  // An advertised ladder is the deployment's intent — the DEFAULT budget
  // never second-guesses it; an EXPLICIT maxWidth filters it (every rung is
  // CDN-valid, so choosing lower ones is always safe — the mobile knob).
  const widths = lattice
    ? options.fullPage.maxWidthExplicit
      ? capWidths(policy.fullPage.widths, options.fullPage.maxWidth)
      : ascending(policy.fullPage.widths)
    : options.fullPage.quantize === 'exact'
      ? null
      : capWidths(options.fullPage.quantize, options.fullPage.maxWidth);

  // Tile levels: an advertised tiles block always wins; otherwise the client
  // quantizer — exact on continuous by default, and the ×2 client pyramid as
  // the fallback for lattice deployments that don't advertise tiles yet.
  const clientPyramid =
    options.tiles.quantize === 'exact' ? null : ascending(options.tiles.quantize);
  const pyramid = lattice
    ? (policy.tiles?.scales ? ascending(policy.tiles.scales) : (clientPyramid ?? options.tiles.fallbackPyramid))
    : clientPyramid;

  const tileSize =
    lattice && policy.tiles?.tileSizes.length
      ? policy.tiles.tileSizes.includes(options.tiles.size)
        ? options.tiles.size
        : policy.tiles.tileSizes[0]!
      : options.tiles.size;

  const engageAt = options.tiles.engageAt ?? (widths === null ? 1.0 : 1.25);

  // Format conforms like everything else: valid under this policy or the
  // deployment's preferred one. (BMP is local-only by the wire contract.)
  const requested = options.format;
  const format =
    requested === undefined
      ? undefined
      : !lattice || (policy.formats as readonly string[]).includes(requested)
        ? requested
        : policy.formats[0];

  return {
    widths,
    maxWidth: options.fullPage.maxWidth,
    pyramid,
    tileSize,
    engageAt,
    tileMaxScale: options.tiles.maxScale,
    format,
    quality: options.quality,
  };
}

/**
 * The ONE base-sizing function — four callers: `renderPage`,
 * `renderSourceKey`, `conformViewport`, and tile engagement. Exact mode
 * returns the (settled) demand itself up to the budget; ladder mode snaps
 * UP and caps at the top rung.
 */
export function baseAskWidth(strategy: ResolvedStrategy, demandWidth: number): number {
  const wanted = Math.max(1, Math.round(demandWidth));
  if (strategy.widths === null) return Math.min(wanted, strategy.maxWidth);
  return strategy.widths.find((w) => w >= wanted) ?? strategy.widths[strategy.widths.length - 1]!;
}

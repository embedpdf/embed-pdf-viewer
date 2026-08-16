/**
 * @embedpdf/plugin-selection — text selection over the engine's text geometry.
 *
 * The PUBLIC surface: the plugin factory, the capability token (narrowed to
 * the public lens), and the range/read vocabulary. Selection ranges live in
 * CHARACTER space (half-open `TextRange` — the same space search hits
 * address), geometry needs `doc.text.select`, text extraction needs
 * `doc.text.copy`, and neither permission implies the other.
 *
 * Framework/host plumbing (gesture intents, geometry warming, the reducer,
 * the coordinate seam) lives behind `@embedpdf/plugin-selection/internal`.
 * Clipboard writes live in `@embedpdf/web` — this package is DOM-free.
 */
import type { CapabilityToken } from '@embedpdf/core';
import { SelectionToken as SelectionHostToken } from './types';
import type { SelectionCapability } from './types';

export { selectionPlugin } from './selection.plugin';
export type {
  SelectionCapability,
  SelectionEndpoint,
  SelectionMenuAnchor,
  SelectionRangeInput,
  SelectionSnapshot,
  TextPosition,
  TextRange,
} from './types';
export type { SelectionSegment } from './geometry';

/**
 * The selection capability token, narrowed to the public
 * {@link SelectionCapability} lens. It is the SAME runtime token the plugin
 * provides — the host-only surface (pointer gestures, geometry warming) is
 * reachable only via `@embedpdf/plugin-selection/internal`.
 */
export const SelectionToken =
  SelectionHostToken as unknown as CapabilityToken<SelectionCapability>;

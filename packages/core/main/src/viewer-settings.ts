/**
 * The viewer's own settings: what every document it opens gets unless the document says
 * otherwise (who the user is, what they may do), and what every plugin's colors fall back to
 * (the accent, the page). The kernel keeps one store of them (`kernel.getSettings()`), so every
 * framework adapter reads and changes the same values: React's `<Viewer>` from its props.
 *
 * The colors are the last step of the lookup `@embedpdf/web`'s `paint()` builds: a part's CSS
 * variable, the variables of what it follows, then its setting, and the viewer's accent last.
 */
import type { Identity } from '@embedpdf/engine-core/runtime';

/** How each page looks before its picture arrives, and around it. */
export interface ViewerPageSettings {
  /** The page before its picture arrives. */
  readonly background: string;
  /** The shadow under each page, as CSS `box-shadow`; `'none'` for none. */
  readonly shadow: string;
}

export interface ViewerSettings {
  /**
   * Who the user is, for every document opened without an `identity` of its own: the author of
   * the annotations they make, and whom `:self` and `:group` permissions are checked against.
   * Null for nobody in particular. The local engine only; the cloud reads it from the token.
   */
  readonly identity: Identity | null;
  /**
   * What the user may do, as permissions, in every document opened without a `scope` of its
   * own. Null for everything. The local engine only; the cloud reads it from the token.
   */
  readonly scope: readonly string[] | null;
  /** The color every part without a color of its own follows. */
  readonly accent: string;
  readonly page: ViewerPageSettings;
}

/** The viewer's settings when the app gives none; the colors are the theming page's defaults. */
export const VIEWER_DEFAULTS: ViewerSettings = Object.freeze({
  identity: null,
  scope: null,
  accent: '#3858e9',
  page: Object.freeze({ background: '#ffffff', shadow: '0 6px 18px rgb(0 0 0 / 0.18)' }),
});

/** An identity is one person: a new one replaces the last instead of merging into it. */
export const VIEWER_WHOLE_SETTINGS = ['identity'] as const;

import { createCapabilityToken } from '@embedpdf/core';

/**
 * @embedpdf/plugin-shell — the contract.
 *
 * The workbench's surface state, and nothing else. A "surface" is anything
 * the app shows or hides by name: a sidebar panel, a modal, an overlay. The
 * plugin stores WHICH surfaces are open; the app owns their DOM entirely
 * (v2's sidebar/modal schema does not exist in v3). Document-scoped: each
 * document keeps its own panels, so switching tabs restores them — and the
 * state is plain serializable data, so plugin-persist snapshots it for free.
 *
 * Exclusivity replaces v2's placement/slot machinery: a surface opened with
 * an `exclusive` tag closes every other surface carrying the same tag (e.g.
 * one panel per side: tag 'left' / 'right'). The tag vocabulary belongs to
 * the app — the kernel doesn't know what a "side" is.
 */

export interface SurfaceState {
  readonly open: boolean;
  /** The exclusivity tag the surface was opened with, if any. */
  readonly exclusive?: string;
  /** Opaque props passed at open (e.g. which annotation a style panel edits). */
  readonly props?: Readonly<Record<string, unknown>>;
}

export interface ShellState {
  readonly surfaces: Readonly<Record<string, SurfaceState>>;
  /** Open dropdown menus, in opening order (last = topmost). */
  readonly openMenus: readonly string[];
}

export interface OpenSurfaceOptions {
  readonly exclusive?: string;
  readonly props?: Readonly<Record<string, unknown>>;
}

export type ShellAction =
  | {
      type: 'SHELL/OPEN_SURFACE';
      id: string;
      exclusive?: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | { type: 'SHELL/CLOSE_SURFACE'; id: string }
  | {
      type: 'SHELL/TOGGLE_SURFACE';
      id: string;
      exclusive?: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | { type: 'SHELL/OPEN_MENU'; id: string }
  | { type: 'SHELL/CLOSE_MENU'; id: string }
  | { type: 'SHELL/CLOSE_ALL_MENUS' };

export interface ShellCapability {
  // ── selectors ──
  isOpen(id: string): boolean;
  surfaceProps(id: string): Readonly<Record<string, unknown>> | undefined;
  /** Ids of all open surfaces. */
  openSurfaces(): string[];
  openMenus(): readonly string[];
  isMenuOpen(id: string): boolean;

  // ── intents ──
  open(id: string, opts?: OpenSurfaceOptions): void;
  close(id: string): void;
  toggle(id: string, opts?: OpenSurfaceOptions): void;
  openMenu(id: string): void;
  closeMenu(id: string): void;
  toggleMenu(id: string): void;
  closeAllMenus(): void;
}

export const ShellToken = createCapabilityToken<ShellCapability>('shell');

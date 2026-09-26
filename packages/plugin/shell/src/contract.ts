/**
 * @embedpdf/plugin-shell/contract — the workbench's surface state, and
 * nothing else. A "surface" is anything the app shows or hides by name: a
 * sidebar panel, a modal, an overlay. The plugin stores which surfaces are
 * open; the app owns their DOM entirely. Document-scoped: each document keeps
 * its own panels, so switching tabs restores them — and the state is plain
 * serializable data, so applications can snapshot and restore it.
 *
 * Exclusivity replaces placement/slot machinery: a surface opened with an
 * `exclusive` tag closes every other surface carrying the same tag (e.g. one
 * panel per side: tag 'left' / 'right'). The tag vocabulary belongs to the app.
 */
import type { EventHook } from '@embedpdf/core';

export { ShellToken } from './token';

export type SurfaceProps = Readonly<Record<string, unknown>>;

export interface SurfaceState {
  readonly id: string;
  readonly open: boolean;
  /** The exclusivity tag the surface was opened with, if any. */
  readonly exclusive?: string;
  /** Opaque props passed at open (e.g. which annotation a style panel edits). */
  readonly props?: SurfaceProps;
}

export interface OpenSurfaceOptions {
  readonly exclusive?: string;
  readonly props?: SurfaceProps;
}

/** Everything the shell holds — serializable, for persist and restore. */
export interface ShellSnapshot {
  readonly surfaces: Readonly<Record<string, Omit<SurfaceState, 'id'>>>;
  /** Open dropdown menus, in opening order (last = topmost). */
  readonly openMenus: readonly string[];
}

// ── events ──
export interface SurfaceEvent {
  readonly id: string;
  readonly props?: SurfaceProps;
}
export interface MenuEvent {
  readonly id: string;
}

export interface ShellCapability {
  // ── surfaces ──
  isOpen(id: string): boolean;
  /** Open flag, exclusivity tag and props; null for a surface never opened. */
  getSurface(id: string): SurfaceState | null;
  /** Open surfaces. Reference-stable while unchanged. */
  listOpenSurfaces(): readonly SurfaceState[];
  open(id: string, options?: OpenSurfaceOptions): void;
  close(id: string): void;
  toggle(id: string, options?: OpenSurfaceOptions): void;
  /** Change a surface's props without reopening it. */
  updateSurfaceProps(id: string, props: SurfaceProps): void;
  /** Close every surface. */
  closeAll(): void;

  // ── menus ──
  isMenuOpen(id: string): boolean;
  /** Open menus in opening order. Reference-stable while unchanged. */
  listOpenMenus(): readonly string[];
  openMenu(id: string): void;
  closeMenu(id: string): void;
  toggleMenu(id: string): void;
  closeAllMenus(): void;

  // ── persistence ──
  getSnapshot(): ShellSnapshot;
  applySnapshot(snapshot: ShellSnapshot): void;

  // ── events ──
  readonly onSurfaceOpened: EventHook<SurfaceEvent>;
  readonly onSurfaceClosed: EventHook<SurfaceEvent>;
  readonly onMenuOpened: EventHook<MenuEvent>;
  readonly onMenuClosed: EventHook<MenuEvent>;
}

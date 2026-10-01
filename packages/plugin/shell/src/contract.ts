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
export interface SurfaceOpenedEvent {
  readonly id: string;
  /** The props it was opened with. */
  readonly props?: SurfaceProps;
}
export interface SurfaceClosedEvent {
  readonly id: string;
}
export interface MenuOpenedEvent {
  readonly id: string;
}
export interface MenuClosedEvent {
  readonly id: string;
}

/**
 * Which surfaces (panels, dialogs) and menus of one document are open. The app
 * draws them; the plugin only holds their state.
 */
export interface ShellCapability {
  // ── surfaces ──
  /** Whether a surface is open. */
  isOpen(id: string): boolean;
  /** Open flag, exclusivity tag and props; null for a surface never opened. */
  getSurface(id: string): SurfaceState | null;
  /** The open surfaces. The same array while none opens or closes. */
  listOpenSurfaces(): readonly SurfaceState[];
  /**
   * Open a surface. `exclusive` closes the other open surfaces of that group,
   * and `props` travel with it. Fires `onSurfaceOpened`, and `onSurfaceClosed`
   * for each surface it closes.
   */
  open(id: string, options?: OpenSurfaceOptions): void;
  /** Close a surface. Fires `onSurfaceClosed` when it was open. */
  close(id: string): void;
  /** Open a closed surface, or close an open one. */
  toggle(id: string, options?: OpenSurfaceOptions): void;
  /** Change a surface's props without reopening it. */
  updateSurfaceProps(id: string, props: SurfaceProps): void;
  /** Close every surface. */
  closeAll(): void;

  // ── menus ──
  /** Whether a menu is open. */
  isMenuOpen(id: string): boolean;
  /** The open menus, in the order they opened (the last one on top). The same array while none opens or closes. */
  listOpenMenus(): readonly string[];
  /** Open a menu, leaving the others open. Fires `onMenuOpened`. */
  openMenu(id: string): void;
  /** Close a menu. Fires `onMenuClosed` when it was open. */
  closeMenu(id: string): void;
  /** Open a closed menu, or close an open one. */
  toggleMenu(id: string): void;
  /** Close every menu, for a click outside or Escape. */
  closeAllMenus(): void;

  // ── persistence ──
  /** Everything the plugin holds, as plain data you can store. */
  getSnapshot(): ShellSnapshot;
  /** Put back what `getSnapshot()` returned. Fires the events of what opens and closes. */
  applySnapshot(snapshot: ShellSnapshot): void;

  // ── events ──
  /** A surface opened, by `open`, `toggle` or `applySnapshot`. */
  readonly onSurfaceOpened: EventHook<SurfaceOpenedEvent>;
  /** A surface closed, by `close`, `toggle`, `closeAll`, an `exclusive` open or `applySnapshot`. */
  readonly onSurfaceClosed: EventHook<SurfaceClosedEvent>;
  /** A menu opened. */
  readonly onMenuOpened: EventHook<MenuOpenedEvent>;
  /** A menu closed. */
  readonly onMenuClosed: EventHook<MenuClosedEvent>;
}

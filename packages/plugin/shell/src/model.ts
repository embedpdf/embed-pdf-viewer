/**
 * The shell's state: which surfaces are open (with their exclusivity tag,
 * props and focus requests) and the stack of open menus. Every function below
 * is a pure transition; the controller applies them with `ctx.state.update`.
 */
import type { OpenSurfaceOptions, ShellSnapshot, SurfaceProps } from './contract';

/** One surface's record; the surface id is its key. */
export interface SurfaceRecord {
  readonly open: boolean;
  readonly exclusive?: string;
  readonly props?: SurfaceProps;
  /** Raised by every open that asks for focus; every way of closing sets it back to 0. */
  readonly focusRequest: number;
}

export interface ShellState {
  readonly surfaces: Readonly<Record<string, SurfaceRecord>>;
  /** Open dropdown menus, in opening order (last = topmost). */
  readonly openMenus: readonly string[];
}

export const initialShellState = (): ShellState => ({ surfaces: {}, openMenus: [] });

/** A surface closed: no longer open, and no request for focus left. */
const closed = (surface: SurfaceRecord): SurfaceRecord => ({
  ...surface,
  open: false,
  focusRequest: 0,
});

/** Close every open surface that shares the exclusivity tag, except `keepId`. */
function closeExclusive(
  surfaces: ShellState['surfaces'],
  exclusive: string,
  keepId: string,
): Record<string, SurfaceRecord> {
  const next: Record<string, SurfaceRecord> = {};
  for (const [id, surface] of Object.entries(surfaces)) {
    const closes = surface.open && surface.exclusive === exclusive && id !== keepId;
    next[id] = closes ? closed(surface) : surface;
  }
  return next;
}

export function openSurface(state: ShellState, id: string, options: OpenSurfaceOptions = {}): ShellState {
  const surfaces = options.exclusive
    ? closeExclusive(state.surfaces, options.exclusive, id)
    : { ...state.surfaces };
  // A closed surface's request is 0, so only an open one carries a count forward.
  const asked = state.surfaces[id]?.focusRequest ?? 0;
  surfaces[id] = {
    open: true,
    exclusive: options.exclusive,
    props: options.props,
    focusRequest: options.focus ? asked + 1 : asked,
  };
  return { ...state, surfaces };
}

export function closeSurface(state: ShellState, id: string): ShellState {
  const surface = state.surfaces[id];
  if (!surface?.open) return state;
  return { ...state, surfaces: { ...state.surfaces, [id]: closed(surface) } };
}

export function toggleSurface(state: ShellState, id: string, options?: OpenSurfaceOptions): ShellState {
  return state.surfaces[id]?.open ? closeSurface(state, id) : openSurface(state, id, options);
}

export function setSurfaceProps(state: ShellState, id: string, props: SurfaceProps): ShellState {
  const surface = state.surfaces[id];
  if (!surface) return state;
  return { ...state, surfaces: { ...state.surfaces, [id]: { ...surface, props } } };
}

export function closeAllSurfaces(state: ShellState): ShellState {
  if (!Object.values(state.surfaces).some((surface) => surface.open)) return state;
  const surfaces: Record<string, SurfaceRecord> = {};
  for (const [id, surface] of Object.entries(state.surfaces)) {
    surfaces[id] = surface.open ? closed(surface) : surface;
  }
  return { ...state, surfaces };
}

export function openMenu(state: ShellState, id: string): ShellState {
  if (state.openMenus.includes(id)) return state;
  return { ...state, openMenus: [...state.openMenus, id] };
}

export function closeMenu(state: ShellState, id: string): ShellState {
  if (!state.openMenus.includes(id)) return state;
  return { ...state, openMenus: state.openMenus.filter((menu) => menu !== id) };
}

export function toggleMenu(state: ShellState, id: string): ShellState {
  return state.openMenus.includes(id) ? closeMenu(state, id) : openMenu(state, id);
}

export function closeAllMenus(state: ShellState): ShellState {
  return state.openMenus.length === 0 ? state : { ...state, openMenus: [] };
}

/** What a snapshot holds: the state without the focus requests, which are moments. */
export function snapshotOf(state: ShellState): ShellSnapshot {
  const surfaces: Record<string, ShellSnapshot['surfaces'][string]> = {};
  for (const [id, { focusRequest: _focusRequest, ...surface }] of Object.entries(state.surfaces)) {
    surfaces[id] = surface;
  }
  return { surfaces, openMenus: state.openMenus };
}

export function applySnapshot(_state: ShellState, snapshot: ShellSnapshot): ShellState {
  const surfaces: Record<string, SurfaceRecord> = {};
  for (const [id, surface] of Object.entries(snapshot.surfaces)) {
    surfaces[id] = { ...surface, focusRequest: 0 };
  }
  return { surfaces, openMenus: [...snapshot.openMenus] };
}

/**
 * The shell's state: which surfaces are open (with their exclusivity tag and
 * props) and the stack of open menus. Every function below is a pure
 * transition; the controller applies them with `ctx.state.update`.
 */
import type { OpenSurfaceOptions, ShellSnapshot, SurfaceProps } from './contract';

/** One surface's record; the surface id is its key. */
export interface SurfaceRecord {
  readonly open: boolean;
  readonly exclusive?: string;
  readonly props?: SurfaceProps;
}

export interface ShellState {
  readonly surfaces: Readonly<Record<string, SurfaceRecord>>;
  /** Open dropdown menus, in opening order (last = topmost). */
  readonly openMenus: readonly string[];
}

export const initialShellState = (): ShellState => ({ surfaces: {}, openMenus: [] });

/** Close every open surface that shares the exclusivity tag, except `keepId`. */
function closeExclusive(
  surfaces: ShellState['surfaces'],
  exclusive: string,
  keepId: string,
): Record<string, SurfaceRecord> {
  const next: Record<string, SurfaceRecord> = {};
  for (const [id, surface] of Object.entries(surfaces)) {
    const closes = surface.open && surface.exclusive === exclusive && id !== keepId;
    next[id] = closes ? { ...surface, open: false } : surface;
  }
  return next;
}

export function openSurface(state: ShellState, id: string, options: OpenSurfaceOptions = {}): ShellState {
  const surfaces = options.exclusive
    ? closeExclusive(state.surfaces, options.exclusive, id)
    : { ...state.surfaces };
  surfaces[id] = { open: true, exclusive: options.exclusive, props: options.props };
  return { ...state, surfaces };
}

export function closeSurface(state: ShellState, id: string): ShellState {
  const surface = state.surfaces[id];
  if (!surface?.open) return state;
  return { ...state, surfaces: { ...state.surfaces, [id]: { ...surface, open: false } } };
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
    surfaces[id] = surface.open ? { ...surface, open: false } : surface;
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

export function applySnapshot(_state: ShellState, snapshot: ShellSnapshot): ShellState {
  return { surfaces: { ...snapshot.surfaces }, openMenus: [...snapshot.openMenus] };
}

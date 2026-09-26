/** The shell slice: which surfaces are open (with their tag and props) and the menu stack. */
import type { ShellSnapshot, SurfaceProps } from './contract';

/** One surface's record (the id is the key). */
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

export type ShellAction =
  | { type: 'SHELL/OPEN_SURFACE'; id: string; exclusive?: string; props?: SurfaceProps }
  | { type: 'SHELL/CLOSE_SURFACE'; id: string }
  | { type: 'SHELL/TOGGLE_SURFACE'; id: string; exclusive?: string; props?: SurfaceProps }
  | { type: 'SHELL/SET_SURFACE_PROPS'; id: string; props: SurfaceProps }
  | { type: 'SHELL/CLOSE_ALL_SURFACES' }
  | { type: 'SHELL/OPEN_MENU'; id: string }
  | { type: 'SHELL/CLOSE_MENU'; id: string }
  | { type: 'SHELL/CLOSE_ALL_MENUS' }
  | { type: 'SHELL/APPLY_SNAPSHOT'; snapshot: ShellSnapshot };

export const initialShellState = (): ShellState => ({ surfaces: {}, openMenus: [] });

/** Close every open surface sharing the exclusivity tag. */
function closeExclusive(
  surfaces: Readonly<Record<string, SurfaceRecord>>,
  exclusive: string,
  except: string,
): Record<string, SurfaceRecord> {
  const next: Record<string, SurfaceRecord> = {};
  for (const [id, s] of Object.entries(surfaces)) {
    next[id] = s.open && s.exclusive === exclusive && id !== except ? { ...s, open: false } : s;
  }
  return next;
}

function openSurface(
  state: ShellState,
  id: string,
  exclusive?: string,
  props?: SurfaceProps,
): ShellState {
  const surfaces = exclusive
    ? closeExclusive(state.surfaces, exclusive, id)
    : { ...state.surfaces };
  surfaces[id] = { open: true, exclusive, props };
  return { ...state, surfaces };
}

function closeSurface(state: ShellState, id: string): ShellState {
  const existing = state.surfaces[id];
  if (!existing?.open) return state;
  return { ...state, surfaces: { ...state.surfaces, [id]: { ...existing, open: false } } };
}

export function shellReducer(state: ShellState, action: ShellAction): ShellState {
  switch (action.type) {
    case 'SHELL/OPEN_SURFACE':
      return openSurface(state, action.id, action.exclusive, action.props);
    case 'SHELL/CLOSE_SURFACE':
      return closeSurface(state, action.id);
    case 'SHELL/TOGGLE_SURFACE':
      return state.surfaces[action.id]?.open
        ? closeSurface(state, action.id)
        : openSurface(state, action.id, action.exclusive, action.props);
    case 'SHELL/SET_SURFACE_PROPS': {
      const existing = state.surfaces[action.id];
      if (!existing) return state;
      return {
        ...state,
        surfaces: { ...state.surfaces, [action.id]: { ...existing, props: action.props } },
      };
    }
    case 'SHELL/CLOSE_ALL_SURFACES': {
      if (!Object.values(state.surfaces).some((s) => s.open)) return state;
      const surfaces: Record<string, SurfaceRecord> = {};
      for (const [id, s] of Object.entries(state.surfaces))
        surfaces[id] = s.open ? { ...s, open: false } : s;
      return { ...state, surfaces };
    }
    case 'SHELL/OPEN_MENU':
      return state.openMenus.includes(action.id)
        ? state
        : { ...state, openMenus: [...state.openMenus, action.id] };
    case 'SHELL/CLOSE_MENU':
      return state.openMenus.includes(action.id)
        ? { ...state, openMenus: state.openMenus.filter((m) => m !== action.id) }
        : state;
    case 'SHELL/CLOSE_ALL_MENUS':
      return state.openMenus.length === 0 ? state : { ...state, openMenus: [] };
    case 'SHELL/APPLY_SNAPSHOT':
      return {
        surfaces: { ...action.snapshot.surfaces },
        openMenus: [...action.snapshot.openMenus],
      };
    default:
      return state;
  }
}

/**
 * The model, messages and effects — the entire surface of the pure core.
 * This is the shape that transliterates to Rust/Crux: plain data, no DOM, no I/O.
 */
import type { Mat2D, Pt } from './mat2d';
import type { Guide, HandleRole } from './geom';

export type Id = string;
export type Kind = 'square' | 'circle';
export type ToolId = 'select' | 'square' | 'circle';

export interface Annotation {
  id: Id;
  kind: Kind;
  color: string;
  /** Places the unit shape into page space — carries position, size AND rotation. */
  transform: Mat2D;
}

export type Phase = 'down' | 'move' | 'up';

export interface PointerSample {
  phase: Phase;
  page: Pt; // pointer in PAGE space (adapter already applied viewToPage)
  view: Pt; // pointer in VIEW px (used for fixed-size handle hit-testing)
  shift: boolean;
}

export interface HitEnv {
  toView: Mat2D; // page → view, so handle tolerance can be measured in px
  handlePx: number;
  page: { width: number; height: number }; // for snapping to page edges/center
}

/** The in-progress gesture. Transient; cleared on pointer-up. */
export type Draft =
  | { g: 'create'; kind: Kind; from: Pt; to: Pt }
  | { g: 'move'; ids: Id[]; start: Pt; delta: Pt; guides: Guide[] }
  | { g: 'resize'; id: Id; anchorLocal: Pt; cornerLocal: Pt; base: Mat2D; cur: Mat2D }
  | { g: 'rotate'; id: Id; pivot: Pt; start: number; base: Mat2D; cur: Mat2D }
  | { g: 'marquee'; from: Pt; to: Pt };

export interface Model {
  tool: ToolId;
  color: string;
  byId: Record<Id, Annotation>;
  order: Id[];
  selected: Id[];
  draft: Draft | null;
  seq: number; // deterministic id counter — pure id-gen
}

export type Msg =
  | { t: 'setTool'; tool: ToolId }
  | { t: 'setColor'; color: string }
  | { t: 'pointer'; s: PointerSample; env: HitEnv }
  | { t: 'rotate90' }
  | { t: 'delete' }
  | { t: 'cancel' };

/** The only impure consequences — performed by the shell (here: logged; real: the repository). */
export type Effect =
  | { fx: 'persistCreate'; annotation: Annotation }
  | { fx: 'persistPatch'; id: Id; transform: Mat2D }
  | { fx: 'persistDelete'; id: Id };

export const initialModel: Model = {
  tool: 'select',
  color: '#1e88e5',
  byId: {},
  order: [],
  selected: [],
  draft: null,
  seq: 0,
};

export type { HandleRole };

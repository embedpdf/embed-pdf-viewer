/**
 * The session: its initial value, the tool defaults new annotations take, and
 * keeping its references to records right when a record is confirmed under a
 * new id (`rekey`) or leaves the view (`forget`).
 */
import { initialTextStyle } from '../props';
import type {
  AnnotationProps,
  AnnotationPropsPatch,
  Draft,
  Effect,
  Id,
  LineEndings,
  Model,
  Session,
  Style,
  Subtype,
} from '../types';

export const initialStyle: Style = {
  color: '#e5484d',
  interiorColor: null,
  strokeWidth: 2,
  opacity: 1,
  blendMode: 'normal',
  border: { kind: 'solid' },
};

export const NO_ENDINGS: LineEndings = { start: 'none', end: 'none' };

export const initialSession: Session = {
  selected: [],
  hovered: null,
  draft: null,
  preview: null,
  seq: 0,
  style: initialStyle,
  defaults: {},
  hitMargin: 6,
  editing: null,
  snap: {
    guides: true,
    guideThreshold: 5,
    rotation: true,
    rotationAngles: [0, 90, 180, 270],
    rotationThreshold: 4,
  },
};

/**
 * Resolve a tool's effective defaults as a full flat props bag: the base `style`
 * + the font/endings base, with the per-tool override layered on top. This is
 * what a defaults-editing UI reads, and what creation projects `style`/`text`
 * from (`styleFromProps` / `textStyleFromProps`).
 */
export function defaultsFor(model: Model, subtype: Subtype): AnnotationProps {
  const toolDefaults = model.defaults[subtype];
  return {
    ...model.style,
    ...initialTextStyle,
    ...toolDefaults,
    lineEndings: { ...NO_ENDINGS, ...toolDefaults?.lineEndings },
  };
}

export function setDefaults(
  model: Model,
  subtype: Subtype,
  patch: AnnotationPropsPatch,
): [Model, Effect[]] {
  const previous = model.defaults[subtype] ?? {};
  const next: AnnotationPropsPatch = { ...previous, ...patch };
  // Endings merge per side, so `{ end: 'open-arrow' }` keeps a configured start.
  if (patch.lineEndings) next.lineEndings = { ...previous.lineEndings, ...patch.lineEndings };
  return [{ ...model, defaults: { ...model.defaults, [subtype]: next } }, []];
}

/** Ids a gesture in progress works on. */
function draftIds(draft: Draft | null): Set<Id> {
  if (!draft) return new Set();
  if (draft.kind === 'move') return new Set(draft.ids);
  if (draft.kind === 'handle' || draft.kind === 'caption' || draft.kind === 'leader') {
    return new Set([draft.id]);
  }
  if (draft.kind === 'rotate' || draft.kind === 'group') return new Set(draft.ids);
  return new Set();
}

/** A draft with every id it holds passed through `swap`. */
function draftWithIds(draft: Draft, swap: (id: Id) => Id): Draft {
  if (draft.kind === 'move' || draft.kind === 'rotate' || draft.kind === 'group') {
    return { ...draft, ids: draft.ids.map(swap) };
  }
  if (draft.kind === 'handle' || draft.kind === 'caption' || draft.kind === 'leader') {
    return { ...draft, id: swap(draft.id) };
  }
  return draft;
}

/** Follow a record to its new id: the selection, hover, text editing and a gesture on it. */
export function rekey(model: Model, from: Id, to: Id): Model {
  const swap = (id: Id): Id => (id === from ? to : id);
  const touches =
    model.selected.includes(from) ||
    model.hovered === from ||
    model.editing === from ||
    draftIds(model.draft).has(from);
  if (!touches) return model;
  return {
    ...model,
    selected: model.selected.map(swap),
    hovered: model.hovered === from ? to : model.hovered,
    editing: model.editing === from ? to : model.editing,
    draft: model.draft && draftWithIds(model.draft, swap),
  };
}

/** Drop every session reference to records that left the view; a gesture on one of them ends. */
export function forget(model: Model, ids: readonly Id[]): Model {
  const gone = new Set(ids);
  const selected = model.selected.filter((id) => !gone.has(id));
  const hovered = model.hovered !== null && gone.has(model.hovered) ? null : model.hovered;
  const editing = model.editing !== null && gone.has(model.editing) ? null : model.editing;
  const draftGone = [...draftIds(model.draft)].some((id) => gone.has(id));
  if (
    selected.length === model.selected.length &&
    hovered === model.hovered &&
    editing === model.editing &&
    !draftGone
  ) {
    return model;
  }
  return { ...model, selected, hovered, editing, draft: draftGone ? null : model.draft };
}

/**
 * The session: its initial value, the tool defaults new annotations take, and
 * dropping its references to records that leave the view (`forget`).
 */
import type { Annotation } from '@embedpdf/engine-core/runtime';

import { readOfDefaults } from '../record/defaults';
import { lineEndingsOf } from '../shapes/points';
import type { Draft, Effect, FieldValues, Id, Model, Session } from '../types';

export const initialSession: Session = {
  selected: [],
  hovered: null,
  draft: null,
  preview: null,
  objectNumbers: [],
  defaults: {},
  hitMargin: 6,
  editing: null,
  snap: {
    alignment: true,
    alignmentThreshold: 6,
    rotation: true,
    rotationAngles: [0, 90, 180, 270],
    rotationThreshold: 4,
  },
};

const NO_DEFAULTS: FieldValues = {};

/** A tool's defaults, by its preset: the engine fields its creates state. */
export const defaultsFor = (model: Model, preset: string): FieldValues =>
  model.defaults[preset] ?? NO_DEFAULTS;

/**
 * What a create from a tool starts from, before it has a shape: the tool's
 * defaults (by its preset) over the engine's for its `kind`, read as an
 * annotation. A ghost is drawn with its style (`styleOf`).
 */
export const toolAnnotation = (model: Model, kind: string, preset: string = kind): Annotation =>
  readOfDefaults(kind, defaultsFor(model, preset));

// A tool's line endings are read off what it creates, as a line's are (shapes/points.ts).
export { lineEndingsOf };

/** Merge fields into a tool's defaults; each value is whole, as in a patch. */
export function setDefaults(model: Model, preset: string, patch: FieldValues): [Model, Effect[]] {
  const next = { ...defaultsFor(model, preset), ...patch };
  return [{ ...model, defaults: { ...model.defaults, [preset]: next } }, []];
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

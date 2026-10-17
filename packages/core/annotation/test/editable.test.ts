import { measureFromKnownLength, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, recordOf, restyle, run, step, STYLE, type RecordInput } from './support';
import {
  editableKindOf,
  isContentsEditableByHand,
  isDeletableByHand,
  isEditableByHand,
  isTransformableByHand,
  type EditableKinds,
} from '../src/editable';
import { annotDeletable, annotTransformable, DRAWN_FLAGS } from '../src/flags';
import { DEFAULT_CHROME_GEOMETRY } from '../src/geometry';
import { groupCaps } from '../src/group';
import { canMove, cursorAt, hitTest, isSelectable } from '../src/hit';
import type { DistanceAppearance } from '../src/measurement';
import { shapeOf, styleOf } from '../src/record';
import type { Message, Model, ModelAnnotation } from '../src/types';
import { chrome } from '../src/view';

const PAGE = toPageRef(1);

const square = (id: string, x = 10): ModelAnnotation =>
  recordOf({
    id,
    ref: null,
    page: PAGE,
    subtype: 'square',
    geometry: {
      kind: 'box',
      box: { x, y: 10, width: 50, height: 50 },
      rotation: 0,
      ellipse: false,
    },
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'vector',
  });

const textBox = (id: string): ModelAnnotation =>
  recordOf({
    id,
    ref: null,
    page: PAGE,
    subtype: 'free-text',
    geometry: {
      kind: 'text-box',
      box: { x: 100, y: 100, width: 200, height: 60 },
      rotation: 0,
      calloutLine: null,
      lineEnding: null,
    },
    style: STYLE,
    flags: DRAWN_FLAGS,
    source: 'vector',
  });

const distance: RecordInput = {
  id: 'distance',
  ref: null,
  page: PAGE,
  subtype: 'line',
  geometry: {
    kind: 'line',
    linePoints: { start: { x: 40, y: 200 }, end: { x: 240, y: 200 } },
    lineEndings: { start: 'closed-arrow', end: 'closed-arrow' },
    rotation: 0,
  },
  measure: {
    intent: 'line-dimension',
    measure: measureFromKnownLength(100, { value: 2, unit: 'm' }),
    captionEnabled: true,
    captionPosition: 'inline',
    captionOffset: null,
    leader: { length: 12, extension: 5 },
    contents: 'stored',
  } satisfies DistanceAppearance,
  style: STYLE,
  flags: DRAWN_FLAGS,
  source: 'vector',
};

/** The records, `ids` selected, under the session's `editable` rule. */
const frozenModel = (
  records: readonly ModelAnnotation[],
  editable: EditableKinds,
  selected: readonly string[] = [],
): Model => ({ ...modelWith([...records]), editable, selected: [...selected] });

const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point: { x, y }, shift: false },
});

const handlesOf = (model: Model) => chrome(model, PAGE).filter((node) => node.kind === 'handle');

describe('the editable rule', () => {
  it('names an annotation by its subtype, and a measurement by its intent', () => {
    expect(editableKindOf(square('s').annotation)).toBe('square');
    expect(editableKindOf(textBox('t').annotation)).toBe('free-text');
    expect(editableKindOf(recordOf(distance).annotation)).toBe('line-dimension');
  });

  it('true lets people change everything, false nothing, a list the kinds it names', () => {
    const record = square('s');
    expect(isEditableByHand({ editable: true }, record.annotation)).toBe(true);
    expect(isEditableByHand({ editable: false }, record.annotation)).toBe(false);
    expect(isEditableByHand({ editable: ['square'] }, record.annotation)).toBe(true);
    expect(isEditableByHand({ editable: ['highlight'] }, record.annotation)).toBe(false);
  });

  it('tells a measurement apart from the line it is drawn as', () => {
    const line = recordOf({ ...distance, id: 'line', measure: undefined });
    const measured = recordOf(distance);
    const shapesOnly = { editable: ['line'] as const };
    expect(isEditableByHand(shapesOnly, line.annotation)).toBe(true);
    expect(isEditableByHand(shapesOnly, measured.annotation)).toBe(false);
    expect(isEditableByHand({ editable: ['line-dimension'] }, measured.annotation)).toBe(true);
  });

  it('sits beside the flags and the authority, and leaves the facts alone', () => {
    const record = square('s');
    const frozen = { editable: false };
    expect(isTransformableByHand(frozen, record)).toBe(false);
    expect(isDeletableByHand(frozen, record)).toBe(false);
    expect(isContentsEditableByHand(frozen, record)).toBe(false);
    // The facts the `can*` twins and code's writes read don't change.
    expect(annotTransformable(record)).toBe(true);
    expect(annotDeletable(record)).toBe(true);
    // A locked annotation stays frozen whatever the rule says.
    const locked = { ...record, annotation: { ...record.annotation, locked: true } };
    expect(isTransformableByHand({ editable: true }, locked)).toBe(false);
  });
});

describe('a frozen annotation', () => {
  it('can still be selected and hovered, with a pointer cursor instead of move', () => {
    const model = frozenModel([square('s')], false);
    expect(isSelectable(model, 's')).toBe(true);
    const selected = run(model, [editPtr('down', 10, 30), editPtr('up', 10, 30)]);
    expect(selected.selected).toEqual(['s']);
    expect(cursorAt(selected, PAGE, { x: 10, y: 30 }, DEFAULT_CHROME_GEOMETRY, 2)).toBe('pointer');
  });

  it('has an outline but no handles and no knob, and its handles are not hit', () => {
    const editable = frozenModel([square('s')], true, ['s']);
    expect(handlesOf(editable)).toHaveLength(8);
    expect(chrome(editable, PAGE).some((node) => node.kind === 'rotate-knob')).toBe(true);

    const frozen = frozenModel([square('s')], false, ['s']);
    expect(chrome(frozen, PAGE).some((node) => node.kind === 'outline')).toBe(true);
    expect(handlesOf(frozen)).toHaveLength(0);
    expect(chrome(frozen, PAGE).some((node) => node.kind === 'rotate-knob')).toBe(false);
    // The bottom-right corner handle of the box is body, not a handle.
    expect(hitTest(frozen, PAGE, { x: 60, y: 60 }, DEFAULT_CHROME_GEOMETRY, 2).kind).not.toBe(
      'handle',
    );
  });

  it('does not move when dragged', () => {
    const before = frozenModel([square('s')], false);
    const after = run(before, [
      editPtr('down', 10, 30),
      editPtr('move', 80, 90),
      editPtr('up', 80, 90),
    ]);
    expect(canMove(after, 's')).toBe(false);
    expect(shapeOf(after.byId.s!.annotation)).toEqual(shapeOf(before.byId.s!.annotation));
  });

  it('is skipped by the selection edits and by delete', () => {
    const model = frozenModel([square('s')], false, ['s']);
    const [restyled, restyleEffects] = step(model, restyle(model, { color: '#00ff00' }));
    expect(styleOf(restyled.byId.s!.annotation).color).not.toBe('#00ff00');
    expect(restyleEffects).toEqual([]);
    expect(step(model, { type: 'rotateSelection', degrees: 90 })[1]).toEqual([]);
    const [deleted, deleteEffects] = step(model, { type: 'delete' });
    expect(deleted.byId.s).toBeDefined();
    expect(deleteEffects).toEqual([]);
  });

  it('keeps its text out of the editor', () => {
    const frozen = frozenModel([textBox('t')], ['square']);
    expect(step(frozen, { type: 'beginTextEdit', id: 't' })[0].editing).toBeNull();
    const editable = frozenModel([textBox('t')], ['free-text']);
    expect(step(editable, { type: 'beginTextEdit', id: 't' })[0].editing).toBe('t');
  });

  it('freezes only the kinds the rule leaves out: shapes frozen, a text box changes', () => {
    const model = frozenModel([square('s'), textBox('t')], ['free-text'], ['s', 't']);
    const [next, effects] = step(model, restyle(model, { color: '#00ff00' }));
    expect(styleOf(next.byId.t!.annotation).color).toBe('#00ff00');
    expect(styleOf(next.byId.s!.annotation).color).not.toBe('#00ff00');
    expect(effects.map((effect) => ('id' in effect ? effect.id : null))).toEqual(['t']);
    // A group with a frozen member does not transform as one.
    expect(groupCaps(model, ['s', 't'])).toEqual({
      movable: false,
      resizable: false,
      rotatable: false,
    });
    const [kept] = step(model, { type: 'delete' });
    expect(Object.keys(kept.byId)).toEqual(['s']);
  });

  it('has no measurement handles while measurements are frozen', () => {
    const measured = recordOf(distance);
    expect(handlesOf(frozenModel([measured], ['line'], ['distance']))).toHaveLength(0);
    expect(
      handlesOf(frozenModel([measured], ['line-dimension'], ['distance'])).length,
    ).toBeGreaterThan(0);
  });
});

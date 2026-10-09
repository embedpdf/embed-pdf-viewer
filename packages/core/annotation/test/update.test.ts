/**
 * The `update` contract: the next session, the records the message changed,
 * and the effects. The core never keeps a record; these tests pin what it
 * reports about them.
 */
import { quadFromRect } from '@embedpdf/core-geometry';
import { toPageRef, type AnnotationFlags } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, RecordInput, recordOf, restyle, step, STYLE, withAnnotation } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import type { Message, Model, ModelAnnotation, Point } from '../src/types';
import { EMPTY_CHANGE, newRecordsAtMost, update } from '../src/update';
import { refOf, shapeOf } from '../src/record';

const PAGE = toPageRef(1);
const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point: { x, y }, shift: false },
});

/** A confirmed white square at `x`, keyed `obj:<n>`. */
const squareInput = (id: string, x: number): RecordInput => ({
  id,
  ref: { kind: 'objectNumber', page: PAGE, objectNumber: Number(id.slice(4)) },
  page: PAGE,
  subtype: 'square',
  geometry: {
    kind: 'box',
    box: { x, y: 100, width: 100, height: 60 },
    rotation: 0,
    ellipse: false,
  },
  style: { ...STYLE, interiorColor: '#ffffff' },
  flags: DRAWN_FLAGS,
  source: 'baked',
});

const square = (id: string, x: number): ModelAnnotation => recordOf(squareInput(id, x));

/** A square with these `/F` flags set. */
const squareWith = (id: string, flags: Partial<AnnotationFlags>): ModelAnnotation =>
  withAnnotation(square(id, 100), flags);

/** A plain free text box, as its create writes it. */
const textBox = (id: string): ModelAnnotation =>
  recordOf({
    ...squareInput(id, 100),
    subtype: 'free-text',
    geometry: {
      kind: 'text-box',
      box: { x: 100, y: 100, width: 100, height: 60 },
      rotation: 0,
      calloutLine: null,
      lineEnding: null,
    },
  });

/** The last step of drawing a square from `from` to `to`: its result, with the new record in it. */
function drawSquare(model: Model, from: Point, to: Point) {
  const draw = (phase: 'down' | 'move' | 'up', point: Point): Message => ({
    type: 'createPointer',
    phase,
    subtype: 'square',
    in: { page: PAGE, point, shift: false },
  });
  const [drawing] = step(step(model, draw('down', from))[0], draw('move', to));
  return update(drawing, draw('up', to));
}

describe('update', () => {
  it('a pointer move during a drag changes the session only', () => {
    const [grabbed] = step(
      modelWith([square('obj:1', 100)], { selected: ['obj:1'] }),
      editPtr('down', 150, 130),
    );
    const result = update(grabbed, editPtr('move', 190, 160));
    expect(result.change).toBe(EMPTY_CHANGE);
    expect(result.session.draft).not.toBe(grabbed.draft);
  });

  it('dropping a moved square puts exactly that square, with one patch', () => {
    const model = modelWith([square('obj:1', 100), square('obj:2', 400)], { selected: ['obj:1'] });
    const dragged = [editPtr('down', 150, 130), editPtr('move', 190, 160)].reduce(
      (current, message) => step(current, message)[0],
      model,
    );
    const result = update(dragged, editPtr('up', 190, 160));
    expect(result.change.put.map((record) => record.id)).toEqual(['obj:1']);
    expect(result.change.drop).toEqual([]);
    // The change is the write: the moved square's box, nothing else.
    expect(result.effects).toEqual([
      {
        type: 'patch',
        id: 'obj:1',
        patch: { subtype: 'square', box: { x: 140, y: 130, width: 100, height: 60 } },
      },
    ]);
    // The change set holds the very patch the effect writes.
    const [write] = result.effects;
    expect(write?.type === 'patch' && write.patch).toBe(result.change.patches['obj:1']);
    // The records it was given are untouched: the core keeps nothing.
    expect(shapeOf(dragged.byId['obj:1']!.annotation)).toEqual(
      shapeOf(model.byId['obj:1']!.annotation),
    );
  });

  it('a delete drops the deleted ids and asks for the engine delete', () => {
    const model = modelWith([square('obj:1', 100)], { selected: ['obj:1'] });
    const result = update(model, { type: 'delete' });
    expect(result.change).toEqual({ put: [], drop: ['obj:1'], patches: {} });
    expect(result.effects).toEqual([{ type: 'delete', id: 'obj:1' }]);
    expect(result.session.selected).toEqual([]);
  });

  it('a new record is keyed by the object number it takes, for life', () => {
    const result = drawSquare(
      modelWith([], { objectNumbers: [42, 43] }),
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    );
    // The first number the session holds, keyed as the engine keys it.
    expect(result.change.put.map((record) => record.id)).toEqual(['obj:42']);
    expect(result.change.put[0]!.annotation.ref).toEqual({
      kind: 'objectNumber',
      page: PAGE,
      objectNumber: 42,
    });
    expect(result.session.objectNumbers).toEqual([43]);
    // Written from the draft it was read from; its /NM is the engine's to write.
    expect(result.effects).toEqual([
      {
        type: 'create',
        id: 'obj:42',
        draft: expect.objectContaining({ subtype: 'square', print: true }),
      },
    ]);
    const [effect] = result.effects;
    expect(effect?.type === 'create' && effect.draft).not.toHaveProperty('nm');
  });

  it('a message that may create needs the numbers it may use; a move needs none', () => {
    const pointer = (phase: 'down' | 'move' | 'up', point: Point = { x: 0, y: 0 }): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'square',
      in: { page: PAGE, point, shift: false },
    });
    expect(newRecordsAtMost(pointer('down'))).toBe(1);
    expect(newRecordsAtMost(pointer('move'))).toBe(0);
    expect(newRecordsAtMost(pointer('up'))).toBe(1);
    const quads = [quadFromRect({ x: 0, y: 0, width: 10, height: 10 })];
    const anchor = { glyphQuad: quads[0]!, advance: 1 as const };
    expect(newRecordsAtMost({ type: 'createReplaceText', page: PAGE, quads, anchor })).toBe(2);
    expect(newRecordsAtMost({ type: 'delete' })).toBe(0);
    // Without the numbers, the core refuses to make a record it can't name.
    const to = { x: 50, y: 50 };
    const [dragging] = step(step(modelWith([]), pointer('down'))[0], pointer('move', to));
    expect(() => update({ ...dragging, objectNumbers: [] }, pointer('up', to))).toThrow(
      /no object number/,
    );
  });

  it('a drawing reads as the draft it is written from', () => {
    const defaults = { square: { color: '#ff0000', strokeWidth: 3, fontSize: 40 } };
    const result = drawSquare(modelWith([], { defaults }), { x: 0, y: 0 }, { x: 50, y: 30 });
    const [effect] = result.effects;
    if (effect?.type !== 'create') throw new Error('a drawing is a create');
    // The tool's defaults its kind has, the shape's fields, the flags a drawing starts with.
    const box = { x: 0, y: 0, width: 50, height: 30 };
    expect(effect.draft).toMatchObject({
      subtype: 'square',
      color: '#ff0000',
      strokeWidth: 3,
      box,
    });
    expect(effect.draft).toMatchObject({ print: true });
    expect(effect.draft).not.toHaveProperty('fontSize'); // a square has no text
    // The view shows what that draft reads back as.
    expect(result.change.put[0]!.annotation).toMatchObject({
      color: '#ff0000',
      strokeWidth: 3,
      box,
    });
  });

  it("a free text's draft carries the tool's font defaults, and opens for typing", () => {
    const defaults = { 'free-text': { fontFamily: 'courier', fontSize: 18, textAlign: 'right' } };
    const click = (phase: 'down' | 'up'): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'free-text',
      clickCreate: { width: 180, height: 40, anchor: 'top-left' },
      in: { page: PAGE, point: { x: 50, y: 50 }, shift: false },
    });
    const [pressed] = step(modelWith([], { defaults }), click('down'));
    const result = update(pressed, click('up'));
    const [effect] = result.effects;
    if (effect?.type !== 'create') throw new Error('a click is a create');
    const fonts = { fontFamily: 'courier', fontSize: 18, textAlign: 'right' };
    expect(effect.draft).toMatchObject({
      subtype: 'free-text',
      intent: 'free-text',
      contents: '',
      ...fonts,
    });
    const record = result.change.put[0]!;
    expect(record.annotation).toMatchObject(fonts);
    expect(result.session.editing).toBe(record.id);
  });

  it("a callout's draft states its intent, text box, line and the tool's arrow", () => {
    const defaults = { 'free-text-callout': { lineEnding: 'closed-arrow' } };
    const callout = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
      type: 'createPointer',
      phase,
      subtype: 'free-text-callout',
      in: { page: PAGE, point: { x, y }, shift: false },
    });
    // The tip, the knee, then the text box dragged out.
    const drawing = [
      callout('down', 40, 60),
      callout('up', 40, 60),
      callout('down', 120, 120),
      callout('up', 120, 120),
      callout('down', 200, 100),
      callout('move', 320, 140),
    ].reduce((model, message) => step(model, message)[0], modelWith([], { defaults }));
    const [effect] = update(drawing, callout('up', 320, 140)).effects;
    if (effect?.type !== 'create') throw new Error('a callout is a create');
    expect(effect.draft).toMatchObject({
      subtype: 'free-text',
      intent: 'free-text-callout',
      contents: '',
      box: { x: 200, y: 100, width: 120, height: 40 },
      lineEnding: 'closed-arrow',
    });
    const line = (effect.draft as { calloutLine?: unknown[] }).calloutLine;
    expect(line).toEqual([{ x: 40, y: 60 }, { x: 120, y: 120 }, expect.anything()]);
  });

  it('a sidebar rect is a command: it moves the shape, and with a new shape it is refused', () => {
    const model = modelWith([square('obj:3', 100)], { selected: ['obj:3'] });
    const rect = model.byId['obj:3']!.annotation.rect;
    const moved = { ...rect, x: rect.x + 50 };
    const result = update(model, { type: 'setFields', patches: { 'obj:3': { rect: moved } } });
    // The write is the shape that puts the square there: its box, not the rect.
    expect(result.change.patches['obj:3']).toEqual({
      subtype: 'square',
      box: { x: 150, y: 100, width: 100, height: 60 },
    });
    expect(() =>
      update(model, {
        type: 'setFields',
        patches: { 'obj:3': { rect: moved, box: { x: 0, y: 0, width: 10, height: 10 } } },
      }),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg', details: { field: 'rect' } }));
  });

  it('typing puts the edited record and asks for a text write', () => {
    const box = textBox('obj:3');
    const result = update(modelWith([box]), { type: 'setText', id: 'obj:3', text: 'Hi\nthere' });
    // As the engine reads it back: one paragraph per line, joined by `\r`.
    expect(result.change.put[0]!.annotation).toMatchObject({
      contents: 'Hi\rthere',
      richText: { paragraphs: [{ runs: [{ text: 'Hi' }] }, { runs: [{ text: 'there' }] }] },
    });
    expect(result.change.put[0]!.source).toBe('vector');
    expect(result.effects).toEqual([{ type: 'text', id: 'obj:3' }]);
  });
});

describe('which fields a write may change', () => {
  const unlock = { subtype: 'square', locked: false };

  it('a locked annotation unlocks from the sidebar and from the flags verb', () => {
    const model = modelWith([squareWith('obj:1', { locked: true })], { selected: ['obj:1'] });
    const fromSidebar = update(model, {
      type: 'setFields',
      patches: { 'obj:1': { locked: false } },
    });
    expect(fromSidebar.effects).toEqual([{ type: 'patch', id: 'obj:1', patch: unlock }]);
    const fromVerb = update(model, { type: 'setFlags', patch: { locked: false } });
    expect(fromVerb.effects).toEqual([{ type: 'patch', id: 'obj:1', patch: unlock }]);
  });

  it('locked keeps the annotation as it is; lockedContents keeps its text', () => {
    const values = { color: '#ff0000', contents: 'note' };
    const locked = modelWith([squareWith('obj:1', { locked: true })]);
    expect(
      update(locked, { type: 'setFields', patches: { 'obj:1': values } }).change.patches,
    ).toEqual({ 'obj:1': { subtype: 'square', contents: 'note' } });
    const textLocked = modelWith([squareWith('obj:1', { lockedContents: true })]);
    expect(
      update(textLocked, { type: 'setFields', patches: { 'obj:1': values } }).change.patches,
    ).toEqual({ 'obj:1': { subtype: 'square', color: '#ff0000' } });
  });

  it('a flag needs update authority', () => {
    const record = {
      ...squareWith('obj:1', { locked: true }),
      authority: { update: false, delete: false },
    };
    const model = modelWith([record], { selected: ['obj:1'] });
    expect(update(model, { type: 'setFlags', patch: { locked: false } }).change).toBe(EMPTY_CHANGE);
  });

  it("a format is written as the free text's body, keeping the rest of it", () => {
    const box = textBox('obj:3');
    const richText = box.annotation.subtype === 'free-text' ? box.annotation.richText : undefined;
    if (!richText) throw new Error('a free text holds its rich text');
    const struck = {
      ...box,
      annotation: {
        ...box.annotation,
        richText: {
          ...richText,
          body: { ...richText.body, decoration: ['line-through' as const] },
        },
      },
    };
    const model = modelWith([struck], { selected: ['obj:3'] });
    const result = update(model, { type: 'setTextFormat', format: 'underline', on: true });
    expect(result.change.patches['obj:3']).toEqual({
      subtype: 'free-text',
      richText: {
        body: { ...richText.body, decoration: ['line-through', 'underline'] },
        paragraphs: richText.paragraphs,
      },
    });
    // A format the body already has is no change.
    const underlined = { ...model, byId: { 'obj:3': result.change.put[0]! } };
    expect(
      update(underlined, { type: 'setTextFormat', format: 'underline', on: true }).change,
    ).toBe(EMPTY_CHANGE);
  });
});

describe('every record holds its annotation', () => {
  const created = (objectNumbers: readonly number[]) =>
    drawSquare(
      modelWith([square('obj:1', 400)], {
        objectNumbers,
        defaults: { square: { color: '#123456', strokeWidth: 3 } },
      }),
      { x: 10, y: 20 },
      { x: 40, y: 60 },
    ).change.put[0]!;

  it('a new record holds the annotation its create writes, under the number it takes', () => {
    const record = created([7]);
    const ref = { kind: 'objectNumber', page: PAGE, objectNumber: 7 };
    // Its ref is final from the start: writes to it name it at once.
    expect(refOf(record)).toEqual(ref);
    expect(record.unconfirmed).toBe(true);
    expect(record.annotation).toMatchObject({
      subtype: 'square',
      ref,
      box: { x: 10, y: 20, width: 30, height: 40 },
      rotation: null,
      color: '#123456',
      strokeWidth: 3,
      print: true,
    });
    // Another session holds other numbers, so its record is another one.
    expect(created([8]).id).toBe('obj:8');
  });

  it('an edit brings the annotation up to date with the fields it changed', () => {
    const model = modelWith([square('obj:1', 100)], { selected: ['obj:1'] });
    const dragged = [editPtr('down', 150, 130), editPtr('move', 190, 160)].reduce(
      (current, message) => step(current, message)[0],
      model,
    );
    const moved = update(dragged, editPtr('up', 190, 160)).change.put[0]!;
    expect(moved.annotation).toMatchObject({
      box: { x: 140, y: 130, width: 100, height: 60 },
      color: STYLE.color,
    });

    const restyled = update(model, restyle(model, { color: '#00ff00' })).change.put[0]!;
    expect(restyled.annotation).toMatchObject({ color: '#00ff00', box: { x: 100, y: 100 } });

    const hidden = update(model, { type: 'setFlags', patch: { hidden: true } }).change.put[0]!;
    expect(hidden.annotation).toMatchObject({ hidden: true, print: true });
  });

  it('an edit that changes nothing changes nothing: no record, no write', () => {
    const model = modelWith([square('obj:1', 100)], { selected: ['obj:1'] });
    const same = update(model, restyle(model, { color: STYLE.color }));
    expect(same.change).toBe(EMPTY_CHANGE);
    expect(same.effects).toEqual([]);
    // A click on the selected square: grabbed and let go where it was.
    const [grabbed] = step(model, editPtr('down', 150, 130));
    const click = update(grabbed, editPtr('up', 150, 130));
    expect(click.change).toBe(EMPTY_CHANGE);
    expect(click.effects).toEqual([]);
  });

  it('a replace-text strikeout replies to its caret by the caret’s number', () => {
    const rect = { x: 20, y: 40, width: 80, height: 20 };
    const [model] = step(modelWith([]), {
      type: 'createReplaceText',
      page: PAGE,
      quads: [quadFromRect(rect)],
      anchor: { glyphQuad: quadFromRect(rect), advance: 1 },
    });
    const [caret, strikeout] = model.order.map((id) => model.byId[id]!);
    expect(caret!.annotation).toMatchObject({
      subtype: 'caret',
      intent: 'replace',
      ref: { kind: 'objectNumber', objectNumber: 100 },
    });
    expect(strikeout!.annotation).toMatchObject({
      subtype: 'strikeout',
      ref: { kind: 'objectNumber', objectNumber: 101 },
      reply: { to: caret!.annotation.ref, type: 'group' },
    });
  });
});

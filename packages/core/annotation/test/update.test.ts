/**
 * The `update` contract: the next session, the records the message changed,
 * and the effects. The core never keeps a record; these tests pin what it
 * reports about them.
 */
import { quadFromRect } from '@embedpdf/core-geometry';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, record, step, STYLE, restyle } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import type { Message, Model, ModelAnnotation, Point } from '../src/types';
import { EMPTY_CHANGE, update } from '../src/update';
import { fieldsOf, refOf } from '../src/record';

const PAGE = toPageRef(1);
const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point: { x, y }, shift: false },
});

const square = (id: string, x: number): ModelAnnotation =>
  record({
    id,
    ref: { kind: 'objectNumber', page: PAGE, annotObjectNumber: Number(id.slice(4)) },
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
    expect(fieldsOf(dragged.byId['obj:1']!).geometry).toEqual(
      fieldsOf(model.byId['obj:1']!).geometry,
    );
  });

  it('a delete drops the deleted ids and asks for the engine delete', () => {
    const model = modelWith([square('obj:1', 100)], { selected: ['obj:1'] });
    const result = update(model, { type: 'delete' });
    expect(result.change).toEqual({ put: [], drop: ['obj:1'], patches: {} });
    expect(result.effects).toEqual([{ type: 'delete', id: 'obj:1' }]);
    expect(result.session.selected).toEqual([]);
  });

  it('a new record is keyed by the name it is written under', () => {
    const result = drawSquare(modelWith([]), { x: 0, y: 0 }, { x: 10, y: 10 });
    // `<namePrefix><seq + 1>` on its page, keyed as the engine keys an `nm` ref.
    expect(result.change.put.map((record) => record.id)).toEqual(['nm:1:new-1']);
    expect(result.session.seq).toBe(1);
    expect(result.effects).toEqual([{ type: 'create', id: 'nm:1:new-1' }]);
  });

  it('typing puts the edited record and asks for a text write', () => {
    const box = record({
      ...fieldsOf(square('obj:3', 100)),
      subtype: 'free-text',
      geometry: {
        kind: 'text-box',
        box: { x: 100, y: 100, width: 100, height: 60 },
        rotation: 0,
        calloutLine: null,
        lineEnding: null,
      },
      annotation: undefined,
    });
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

describe('every record holds its annotation', () => {
  const created = (namePrefix: string) =>
    drawSquare(
      modelWith([square('obj:1', 400)], {
        namePrefix,
        defaults: { square: { color: '#123456', strokeWidth: 3 } },
      }),
      { x: 10, y: 20 },
      { x: 40, y: 60 },
    ).change.put[0]!;

  it('a new record predicts its annotation, named with the session’s prefix', () => {
    const record = created('session-a-');
    expect(refOf(record)).toBeNull();
    expect(record.annotation).toMatchObject({
      subtype: 'square',
      ref: { kind: 'nm', page: PAGE, nm: 'session-a-1' },
      nm: 'session-a-1',
      index: 1,
      box: { x: 10, y: 20, width: 30, height: 40 },
      rotation: null,
      color: '#123456',
      strokeWidth: 3,
      print: true,
    });
    // The engine is asked to write that same name.
    expect(created('session-b-').annotation.nm).toBe('session-b-1');
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

  it('a replace-text strikeout replies to its caret by the caret’s name', () => {
    const rect = { x: 20, y: 40, width: 80, height: 20 };
    const [model] = step(modelWith([]), {
      type: 'createReplaceText',
      page: PAGE,
      quads: [quadFromRect(rect)],
      anchor: { glyphQuad: quadFromRect(rect), advance: 1 },
    });
    const [caret, strikeout] = model.order.map((id) => model.byId[id]!);
    expect(caret!.annotation).toMatchObject({ subtype: 'caret', intent: 'replace', nm: 'new-1' });
    expect(strikeout!.annotation).toMatchObject({
      subtype: 'strikeout',
      nm: 'new-2',
      reply: { to: caret!.annotation.ref, type: 'group' },
    });
  });
});

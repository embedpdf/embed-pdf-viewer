/**
 * The `update` contract: the next session, the records the message changed,
 * and the effects. The core never keeps a record; these tests pin what it
 * reports about them.
 */
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { modelWith, step } from './support';
import { DRAWN_FLAGS } from '../src/flags';
import type { Message, ModelAnnotation } from '../src/types';
import { EMPTY_CHANGE, initialStyle, update } from '../src/update';

const PAGE = toPageRef(1);
const editPtr = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
  type: 'editPointer',
  phase,
  in: { page: PAGE, point: { x, y }, shift: false },
});

const square = (id: string, x: number): ModelAnnotation => ({
  id,
  ref: { kind: 'objectNumber', page: PAGE, annotObjectNumber: Number(id.slice(4)) },
  page: PAGE,
  subtype: 'square',
  geometry: { kind: 'rect', rect: { x, y: 100, width: 100, height: 60 }, ellipse: false },
  style: { ...initialStyle, interiorColor: '#ffffff' },
  flags: DRAWN_FLAGS,
  source: 'baked',
});

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
    expect(result.effects).toEqual([{ type: 'patch', id: 'obj:1', scope: { kind: 'geometry' } }]);
    // The records it was given are untouched: the core keeps nothing.
    expect(dragged.byId['obj:1']!.geometry).toEqual(model.byId['obj:1']!.geometry);
  });

  it('a delete drops the deleted ids and asks for the engine delete', () => {
    const model = modelWith([square('obj:1', 100)], { selected: ['obj:1'] });
    const result = update(model, { type: 'delete' });
    expect(result.change).toEqual({ put: [], drop: ['obj:1'] });
    expect(result.effects).toEqual([{ type: 'delete', id: 'obj:1' }]);
    expect(result.session.selected).toEqual([]);
  });

  it('a new record gets a new: id from the session', () => {
    const result = update(modelWith([]), {
      type: 'createAnnot',
      page: PAGE,
      subtype: 'square',
      geometry: { kind: 'rect', rect: { x: 0, y: 0, width: 10, height: 10 }, ellipse: false },
    });
    expect(result.change.put.map((record) => record.id)).toEqual(['new:1']);
    expect(result.session.seq).toBe(1);
    expect(result.effects).toEqual([{ type: 'create', id: 'new:1' }]);
  });

  it('typing puts the edited record and asks for a text write', () => {
    const record: ModelAnnotation = {
      ...square('obj:3', 100),
      subtype: 'free-text',
      geometry: { kind: 'text', rect: { x: 100, y: 100, width: 100, height: 60 } },
      data: {
        subtype: 'free-text',
        contents: 'Hi',
        richText: { body: {}, paragraphs: [] },
      } as never,
    };
    const result = update(modelWith([record]), { type: 'setText', id: 'obj:3', text: 'Hi there' });
    expect(result.change.put[0]!.data!.contents).toBe('Hi there');
    expect(result.change.put[0]!.source).toBe('vector');
    expect(result.effects).toEqual([{ type: 'text', id: 'obj:3' }]);
  });
});

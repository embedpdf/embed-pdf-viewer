/**
 * What one event-stream connection may see of an audit row: annotations take
 * `doc.annotate.read`, widgets and form fields `doc.forms.read`, and a row
 * left with nothing to read goes out withheld, with only its pins.
 */
import { describe, expect, it } from 'vitest';

import { visibleRow, type StreamRow } from '../src/services/eventVisibility';

const EVERYTHING = { annotations: true, forms: true };
const FILLER = { annotations: false, forms: true };
const COMMENTER = { annotations: true, forms: false };

const cacheDelta = { previousDocVersion: 1, docVersion: 2, pages: [] };
const square = { subtype: 'square', contents: 'internal note' };
const widget = { subtype: 'widget', field: { kind: 'objectNumber', objectNumber: 9 } };
const page = { kind: 'objectNumber', objectNumber: 3 };
const squareRef = { kind: 'objectNumber', page, objectNumber: 5 };
const widgetRef = { kind: 'objectNumber', page, objectNumber: 9 };
const row = (kind: string, payload: Record<string, unknown>): StreamRow => ({
  id: 7,
  kind,
  sub: 'alice',
  payload: { ...payload, meta: { cacheDelta, changed: ['secret'] } },
});
const withheld = (kind: string): StreamRow => ({
  id: 7,
  kind,
  sub: 'alice',
  withheld: true,
  payload: { meta: { cacheDelta } },
});

describe('visibleRow', () => {
  it('sends everything to a connection that may read everything', () => {
    const created = row('annot.create', { annotation: square });
    expect(visibleRow(created, EVERYTHING)).toBe(created);
  });

  it('withholds an annotation from a filler, and a widget from a commenter', () => {
    expect(visibleRow(row('annot.update', { annotation: square }), FILLER)).toEqual(
      withheld('annot.update'),
    );
    const widgetUpdate = row('annot.update', { annotation: widget });
    expect(visibleRow(widgetUpdate, FILLER)).toBe(widgetUpdate);
    expect(visibleRow(widgetUpdate, COMMENTER)).toEqual(withheld('annot.update'));
    expect(visibleRow(row('annot.delete', {}), FILLER)).toEqual(withheld('annot.delete'));
  });

  it('withholds form rows from a commenter', () => {
    const fill = row('form.setValue', { field: { name: 'salary' } });
    expect(visibleRow(fill, COMMENTER)).toEqual(withheld('form.setValue'));
    expect(visibleRow(fill, FILLER)).toBe(fill);
  });

  it('keeps of a change only the items the connection may read', () => {
    const change = row('change', {
      items: [
        { type: 'annotations.create', annotation: square },
        { type: 'forms.setValue', field: { name: 'salary' } },
        { type: 'annotations.reorder', order: [squareRef] },
        { type: 'forms.reorderWidgets', order: [widgetRef] },
        { type: 'metadata.update', metadata: { title: 'T' } },
      ],
    });
    expect((visibleRow(change, FILLER).payload as { items: unknown[] }).items).toEqual([
      { type: 'forms.setValue', field: { name: 'salary' } },
      { type: 'forms.reorderWidgets', order: [widgetRef] },
      { type: 'metadata.update', metadata: { title: 'T' } },
    ]);
    expect((visibleRow(change, COMMENTER).payload as { items: unknown[] }).items).toEqual([
      { type: 'annotations.create', annotation: square },
      { type: 'annotations.reorder', order: [squareRef] },
      { type: 'metadata.update', metadata: { title: 'T' } },
    ]);
    const onlyComments = row('change', {
      items: [{ type: 'annotations.update', annotation: square }],
    });
    expect(visibleRow(onlyComments, FILLER)).toEqual(withheld('change'));
  });

  it('sends what neither capability guards to everyone', () => {
    const rotate = row('pages.rotate', { layout: { pages: [] } });
    expect(visibleRow(rotate, { annotations: false, forms: false })).toBe(rotate);
  });
});

import { describe, expect, test } from 'vitest';
import type { FormFieldDTO, FormSnapshot } from '@embedpdf/engine-core/runtime';

import { fillItemForWidget, fillItems } from '../src/core/fill-items';
import { fieldByKey, fieldForWidget, fieldKeyOf, initialModel, update } from '../src/core/model';

const text = (over: Partial<Extract<FormFieldDTO, { family: 'text' }>> = {}): FormFieldDTO => ({
  ref: { kind: 'objectNumber', fieldObjectNumber: 4 },
  fieldObjectNumber: 4,
  name: 'maxlen_text',
  family: 'text',
  origin: 'acroform',
  flags: { readOnly: false, required: false, noExport: false, raw: 0 },
  alternateName: null,
  mappingName: null,
  widgets: [{ annotObjectNumber: 4, pageObjectNumber: 3 }],
  value: 'abc',
  defaultValue: '',
  maxLength: 5,
  multiline: false,
  password: false,
  comb: false,
  ...over,
});

const snapshot = (fields: FormFieldDTO[]): FormSnapshot => ({
  formKind: 'acroform',
  needsAppearances: false,
  fields,
});

describe('form model', () => {
  test('snapshot indexes fields by key and widget', () => {
    const m = update(initialModel(), { t: 'snapshot', snapshot: snapshot([text()]) });
    expect(fieldByKey(m, 'obj:4')?.name).toBe('maxlen_text');
    expect(fieldForWidget(m, 4)?.name).toBe('maxlen_text');
    expect(fieldKeyOf(text())).toBe('obj:4');
  });

  test('write lifecycle: start disables, done patches, failed reverts', () => {
    let m = update(initialModel(), { t: 'snapshot', snapshot: snapshot([text()]) });
    m = update(m, { t: 'writeStart', key: 'obj:4' });
    expect(m.writing['obj:4']).toBe(true);
    m = update(m, { t: 'writeDone', key: 'obj:4', field: text({ value: 'abcde' }) });
    expect(m.writing['obj:4']).toBeUndefined();
    expect((fieldByKey(m, 'obj:4') as { value: string }).value).toBe('abcde');

    m = update(m, { t: 'writeStart', key: 'obj:4' });
    m = update(m, { t: 'writeFailed', key: 'obj:4' });
    expect(m.writing['obj:4']).toBeUndefined();
    expect((fieldByKey(m, 'obj:4') as { value: string }).value).toBe('abcde');
  });

  test('fillItems joins field plane with widget-plane geometry', () => {
    let m = update(initialModel(), { t: 'snapshot', snapshot: snapshot([text()]) });
    // No geometry yet → nothing to paint.
    expect(fillItems(m, 3)).toEqual([]);

    m = update(m, {
      t: 'pageGeom',
      pageObjectNumber: 3,
      boxes: { 4: { x: 10, y: 20, width: 200, height: 24 } },
    });
    const items = fillItems(m, 3);
    expect(items.length).toBe(1);
    const item = items[0]!;
    expect(item.control).toBe('text');
    expect(item.box).toEqual({ x: 10, y: 20, width: 200, height: 24 });
    if (item.control === 'text') {
      expect(item.value).toBe('abc');
      expect(item.maxLength).toBe(5);
    }
    // Other pages stay empty; clearing geometry empties the projection.
    expect(fillItems(m, 99)).toEqual([]);
    m = update(m, { t: 'clearGeom' });
    expect(fillItems(m, 3)).toEqual([]);
  });

  test('fillItemForWidget projects one widget without geometry', () => {
    let m = update(initialModel(), { t: 'snapshot', snapshot: snapshot([text()]) });
    // No geometry needed — the annotation plane owns the live box; the
    // projected box falls back to zeros (advisory only on this path).
    const item = fillItemForWidget(m, 4);
    expect(item?.control).toBe('text');
    expect(item?.box).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    if (item?.control === 'text') expect(item.value).toBe('abc');
    // Cached geometry is used when it happens to be loaded.
    m = update(m, {
      t: 'pageGeom',
      pageObjectNumber: 3,
      boxes: { 4: { x: 10, y: 20, width: 200, height: 24 } },
    });
    expect(fillItemForWidget(m, 4)?.box).toEqual({ x: 10, y: 20, width: 200, height: 24 });
    // Unknown widget → null.
    expect(fillItemForWidget(m, 999)).toBeNull();
  });

  test('read-only and in-flight fields project as disabled', () => {
    const ro = text({ flags: { readOnly: true, required: false, noExport: false, raw: 1 } });
    let m = update(initialModel(), { t: 'snapshot', snapshot: snapshot([ro]) });
    m = update(m, {
      t: 'pageGeom',
      pageObjectNumber: 3,
      boxes: { 4: { x: 0, y: 0, width: 10, height: 10 } },
    });
    expect(fillItems(m, 3)[0]!.disabled).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { toPageRef, type DocumentEvent } from '@embedpdf/core';

import { pixelChangeOf } from '../src/invalidation';

const PAGE_OBJECT_NUMBERS = [11, 22, 33];

/** Minimal event shapes — only the fields the invalidation map reads. */
const documentEvent = (partial: Record<string, unknown>): DocumentEvent =>
  partial as unknown as DocumentEvent;
const widget = (pageObjectNumber: number) => ({
  annotObjectNumber: 5,
  page: toPageRef(pageObjectNumber),
});

describe('pixelChangeOf — the built-in event → pixels map', () => {
  const allPageObjectNumbers = () => PAGE_OBJECT_NUMBERS;
  const changeOf = (partial: Record<string, unknown>) =>
    pixelChangeOf(documentEvent(partial), allPageObjectNumbers);

  it.each(['annotation.created', 'annotation.updated', 'annotation.deleted', 'annotation.moved'])(
    '%s repaints its page’s annotations',
    (type) => {
      expect(changeOf({ type, page: toPageRef(22) })).toEqual({
        pages: [22],
        scope: 'annotations',
      });
    },
  );

  it.each(['form.valueChanged', 'form.effectsApplied'])(
    '%s repaints every page a changed widget lives on',
    (type) => {
      expect(changeOf({ type, changedWidgets: [widget(11), widget(33)] })).toEqual({
        pages: [11, 33],
        scope: 'annotations',
      });
    },
  );

  it('form.fieldDeleted repaints the removed widgets’ pages', () => {
    expect(changeOf({ type: 'form.fieldDeleted', removedWidgets: [widget(22)] })).toEqual({
      pages: [22],
      scope: 'annotations',
    });
  });

  it.each(['form.fieldCreated', 'form.fieldUpdated', 'form.widgetAttached', 'form.widgetDetached'])(
    '%s repaints the field’s widget pages',
    (type) => {
      expect(changeOf({ type, field: { widgets: [widget(11), widget(22)] } })).toEqual({
        pages: [11, 22],
        scope: 'annotations',
      });
    },
  );

  it.each(['form.imported', 'form.repaired'])('%s (coarse result) repaints all pages', (type) => {
    expect(changeOf({ type })).toEqual({ pages: PAGE_OBJECT_NUMBERS, scope: 'annotations' });
  });

  it('signature.completed repaints the sealed widget’s page', () => {
    expect(changeOf({ type: 'signature.completed', signature: { widget: widget(33) } })).toEqual({
      pages: [33],
      scope: 'annotations',
    });
  });

  it.each(['redaction.applied', 'pages.flattened'])(
    '%s repaints the content of the applied pages only',
    (type) => {
      const results = [
        { page: toPageRef(11), status: 'applied' },
        { page: toPageRef(22), status: 'unchanged' },
        { page: toPageRef(33), status: 'applied' },
      ];
      expect(changeOf({ type, results })).toEqual({ pages: [11, 33], scope: 'content' });
    },
  );

  it('annotations.flattened repaints its page’s content when anything was applied', () => {
    const page = toPageRef(22);
    expect(
      changeOf({
        type: 'annotations.flattened',
        page,
        results: [{ status: 'skipped' }, { status: 'applied' }],
      }),
    ).toEqual({ pages: [22], scope: 'content' });
    expect(
      changeOf({ type: 'annotations.flattened', page, results: [{ status: 'skipped' }] }),
    ).toBeNull();
  });

  it('stream.desynced repaints the content of every page', () => {
    expect(changeOf({ type: 'stream.desynced', reason: 'backlog-overflow', ts: 0 })).toEqual({
      pages: PAGE_OBJECT_NUMBERS,
      scope: 'content',
    });
  });

  it.each([
    'pages.rotated',
    'pages.moved',
    'pages.deleted',
    'metadata.updated',
    'document.versioned',
  ])('%s repaints nothing (registry, metadata or version, not pixels)', (type) => {
    expect(changeOf({ type })).toBeNull();
  });
});

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

  it.each([
    'annotations.created',
    'annotations.updated',
    'annotations.deleted',
    'annotations.restored',
    'annotations.reordered',
  ])('%s repaints its page’s annotations', (type) => {
    expect(changeOf({ type, page: toPageRef(22) })).toEqual({
      pages: [22],
      scope: 'annotations',
    });
  });

  it.each([
    'forms.valueSet',
    'forms.effectsApplied',
    'forms.created',
    'forms.updated',
    'forms.deleted',
    'forms.restored',
    'forms.widgetAdded',
    'forms.widgetRemoved',
    'forms.widgetRestored',
    'forms.widgetUpdated',
  ])('%s repaints the form fields of every page a changed widget lives on', (type) => {
    expect(
      changeOf({ type, meta: { changedWidgets: [widget(11), widget(33), widget(11)] } }),
    ).toEqual({
      pages: [11, 33],
      scope: 'fields',
    });
  });

  it('a form fact counts the widget rows it carries and a deleted widget’s page', () => {
    expect(
      changeOf({
        type: 'forms.widgetDeleted',
        page: toPageRef(22),
        meta: { changedWidgets: [] },
      }),
    ).toEqual({ pages: [22], scope: 'fields' });
    expect(
      changeOf({
        type: 'forms.widgetAdded',
        widgets: [widget(33)],
        meta: { changedWidgets: [widget(11)] },
      }),
    ).toEqual({ pages: [11, 33], scope: 'fields' });
    expect(
      changeOf({
        type: 'forms.widgetsReordered',
        page: toPageRef(11),
        meta: { changedWidgets: [] },
      }),
    ).toEqual({ pages: [11], scope: 'fields' });
  });

  it('forms.repaired (coarse result) repaints the form fields of all pages', () => {
    expect(changeOf({ type: 'forms.repaired' })).toEqual({
      pages: PAGE_OBJECT_NUMBERS,
      scope: 'fields',
    });
  });

  it('signatures.completed repaints the sealed widget’s page', () => {
    expect(changeOf({ type: 'signatures.completed', signature: { widget: widget(33) } })).toEqual({
      pages: [33],
      scope: 'fields',
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
        results: [{ status: 'unchanged' }, { status: 'applied' }],
      }),
    ).toEqual({ pages: [22], scope: 'content' });
    expect(
      changeOf({ type: 'annotations.flattened', page, results: [{ status: 'unchanged' }] }),
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
    'pages.reordered',
    'pages.deleted',
    'metadata.updated',
    'document.versioned',
    'forms.calculationsReordered',
  ])('%s repaints nothing (registry, metadata, version or order, not pixels)', (type) => {
    expect(changeOf({ type })).toBeNull();
  });
});

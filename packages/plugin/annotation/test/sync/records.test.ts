import type { DocumentEvent } from '@embedpdf/core';
import { reload } from '@embedpdf/core';
import type { Annotation } from '@embedpdf/engine-core/runtime';
import { annotationKey, formWidget, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { foldRecords, NO_RECORDS, type AnnotationRecords } from '../../src/sync/records';

/**
 * The confirmed layer: a pure fold over confirmed events from every origin,
 * page re-reads for events that describe annotations too coarsely, and the
 * appearance version that tells the page when to fetch its rasters again.
 */
const event = (partial: Record<string, unknown>): DocumentEvent =>
  ({
    origin: { kind: 'remote', sessionId: 'them', sub: null, ts: 0, serverId: 45 },
    meta: { changed: [], shouldRefetch: null, weakRefsInvalidated: false },
    ...partial,
  }) as unknown as DocumentEvent;

const recordOn = (
  pageObjectNumber: number,
  annotObjectNumber: number,
  extra: Record<string, unknown> = {},
): Annotation =>
  ({
    ref: {
      kind: 'objectNumber',
      page: toPageRef(pageObjectNumber),
      objectNumber: annotObjectNumber,
    },
    page: toPageRef(pageObjectNumber),
    subtype: 'square',
    ...extra,
  }) as unknown as Annotation;

/** An annotation born inline in the file's `/Annots`: named by its place there, for life. */
const inlineOn = (pageObjectNumber: number, baseIndex: number): Annotation =>
  recordOn(pageObjectNumber, 0, {
    ref: { kind: 'baseIndex', page: toPageRef(pageObjectNumber), baseIndex },
  });

const recordsOf = (...dtos: Annotation[]): AnnotationRecords => ({
  byKey: Object.fromEntries(dtos.map((dto) => [annotationKey(dto.ref), { dto, apVersion: 0 }])),
  order: dtos.map((dto) => annotationKey(dto.ref)),
});

const applied = (records: AnnotationRecords, next: DocumentEvent): AnnotationRecords =>
  foldRecords(records, next) as AnnotationRecords;

describe('foldRecords', () => {
  it('adds created and updated records and removes deleted ones', () => {
    const one = recordOn(11, 1);
    let records = applied(
      NO_RECORDS,
      event({ type: 'annotations.created', page: one.page, annotation: one }),
    );
    expect(records.order).toEqual(['obj:1']);
    records = applied(
      records,
      event({
        type: 'annotations.deleted',
        page: one.page,
        deleted: [{ kind: 'objectNumber', objectNumber: 1 }],
      }),
    );
    expect(records).toEqual(NO_RECORDS);
  });

  it('drops the records of deleted pages', () => {
    const records = recordsOf(recordOn(11, 1), recordOn(12, 2));
    const next = applied(records, event({ type: 'pages.deleted', pages: [toPageRef(12)] }));
    expect(next.order).toEqual(['obj:1']);
  });

  it('re-reads inserted pages and the pages a redaction applied to', () => {
    expect(
      foldRecords(
        NO_RECORDS,
        event({ type: 'pages.inserted', insertedPages: [toPageRef(21), toPageRef(22)] }),
      ),
    ).toEqual(reload({ pages: [toPageRef(21), toPageRef(22)] }));
    expect(
      foldRecords(
        NO_RECORDS,
        event({
          type: 'redaction.applied',
          results: [
            { status: 'applied', page: toPageRef(11) },
            { status: 'skipped', page: toPageRef(12) },
          ],
        }),
      ),
    ).toEqual(reload({ pages: [toPageRef(11)] }));
  });

  it('re-reads the page an undo brought annotations back to: the event says what, not where', () => {
    const restored = event({
      type: 'annotations.restored',
      page: toPageRef(11),
      annotations: [recordOn(11, 7)],
    });
    expect(foldRecords(recordsOf(recordOn(11, 1)), restored)).toEqual(
      reload({ pages: [toPageRef(11)] }),
    );
  });

  it('re-reads the pages a flatten applied to', () => {
    const results = [
      { status: 'applied', page: toPageRef(11) },
      { status: 'unchanged', page: toPageRef(12) },
    ];
    expect(foldRecords(NO_RECORDS, event({ type: 'pages.flattened', results }))).toEqual(
      reload({ pages: [toPageRef(11)] }),
    );
    const page = toPageRef(12);
    expect(
      foldRecords(
        NO_RECORDS,
        event({ type: 'annotations.flattened', page, results: [{ status: 'applied' }] }),
      ),
    ).toEqual(reload({ pages: [page] }));
    const records = recordsOf(recordOn(12, 3));
    expect(
      foldRecords(
        records,
        event({ type: 'annotations.flattened', page, results: [{ status: 'unchanged' }] }),
      ),
    ).toBe(records);
  });

  it('leaves the records alone on form and signing events: widgets come with the form', () => {
    const records = recordsOf(recordOn(11, 1));
    const widgets = [formWidget(5, toPageRef(11))];
    for (const formEvent of [
      { type: 'forms.repaired', widgetsLinked: 1, appearancesBaked: 2 },
      { type: 'forms.created', field: { widgets } },
      { type: 'forms.effectsApplied', meta: { changedWidgets: widgets } },
      { type: 'forms.valueSet', meta: { changedWidgets: widgets } },
      { type: 'signatures.completed', signature: { widget: widgets[0] } },
    ]) {
      expect(foldRecords(records, event(formEvent))).toBe(records);
    }
  });
});

describe('appearance versions', () => {
  const square = recordOn(11, 1);
  const versionOf = (records: AnnotationRecords, key = 'obj:1') => records.byKey[key]?.apVersion;

  it('a created record starts with a freshly baked appearance', () => {
    const records = applied(
      NO_RECORDS,
      event({ type: 'annotations.created', page: square.page, annotation: square }),
    );
    expect(versionOf(records)).toBe(1);
  });

  it('an update advances the version only when the engine re-baked the appearance', () => {
    const records = recordsOf(square);
    const updated = (changed: boolean) =>
      event({
        type: 'annotations.updated',
        page: square.page,
        annotation: square,
        appearance: { changed },
      });
    expect(versionOf(applied(records, updated(false)))).toBe(0);
    expect(versionOf(applied(records, updated(true)))).toBe(1);
  });

  it('a z-order change never changes an appearance', () => {
    const records = applied(
      recordsOf(square),
      event({ type: 'annotations.reordered', page: square.page, order: [square.ref] }),
    );
    expect(versionOf(records)).toBe(0);
  });
});

describe('annotations born inline in the file', () => {
  it('keep their name for life: an update leaves them in place, under the same key', () => {
    const inline = inlineOn(11, 3);
    const records = recordsOf(inline, recordOn(11, 7));
    const next = applied(
      records,
      event({
        type: 'annotations.updated',
        page: inline.page,
        annotation: { ...inline, contents: 'Changed' } as Annotation,
        appearance: { changed: true },
      }),
    );
    expect(next.order).toEqual(['base:11:3', 'obj:7']);
    expect(next.byKey['base:11:3']!.apVersion).toBe(1);
  });
});

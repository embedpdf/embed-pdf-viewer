import type { DocumentEvent } from '@embedpdf/core';
import { reload } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { annotationKey, formWidget, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { foldRecords, NO_RECORDS, type AnnotationRecords } from '../../src/sync/records';
import { annotationHarness } from '../harness';

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
): AnnotationDTO =>
  ({
    ref: { kind: 'objectNumber', page: toPageRef(pageObjectNumber), annotObjectNumber },
    page: toPageRef(pageObjectNumber),
    index: annotObjectNumber,
    subtype: 'square',
    ...extra,
  }) as unknown as AnnotationDTO;

/** A direct-object annotation without /NM, addressed by its position on the page. */
const weakOn = (pageObjectNumber: number, index: number): AnnotationDTO =>
  recordOn(pageObjectNumber, 0, {
    ref: { kind: 'index', page: toPageRef(pageObjectNumber), index, revision: {} },
    index,
  });

const named = (dto: AnnotationDTO, nm: string): AnnotationDTO =>
  ({ ...dto, nm, ref: { kind: 'nm', page: dto.page, nm } as AnnotationRef }) as AnnotationDTO;

const recordsOf = (...dtos: AnnotationDTO[]): AnnotationRecords => ({
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
      event({ type: 'annotation.created', page: one.page, annotation: one }),
    );
    expect(records.order).toEqual(['obj:1']);
    records = applied(
      records,
      event({
        type: 'annotation.deleted',
        page: one.page,
        deleted: { kind: 'objectNumber', value: 1 },
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

  it('re-reads everything after a form repair that linked widgets or baked appearances', () => {
    const records = recordsOf(recordOn(11, 1));
    const repair = (widgetsLinked: number, appearancesBaked: number) =>
      event({ type: 'form.repaired', widgetsLinked, appearancesBaked });
    expect(foldRecords(records, repair(1, 0))).toEqual(reload());
    expect(foldRecords(records, repair(0, 2))).toEqual(reload());
    expect(foldRecords(records, repair(0, 0))).toBe(records);
  });

  it('re-reads the widget pages a script changed: effects can change display flags and colors', () => {
    expect(
      foldRecords(
        recordsOf(recordOn(11, 5)),
        event({ type: 'form.effectsApplied', changedWidgets: [formWidget(5, toPageRef(11))] }),
      ),
    ).toEqual(reload({ pages: [toPageRef(11)] }));
  });

  it('re-reads the pages of a new form field, from any session', () => {
    expect(
      foldRecords(
        NO_RECORDS,
        event({ type: 'form.fieldCreated', field: { widgets: [formWidget(5, toPageRef(11))] } }),
      ),
    ).toEqual(reload({ pages: [toPageRef(11)] }));
  });
});

describe('appearance versions', () => {
  const square = recordOn(11, 1);
  const versionOf = (records: AnnotationRecords, key = 'obj:1') => records.byKey[key]?.apVersion;

  it('a created record starts with a freshly baked appearance', () => {
    const records = applied(
      NO_RECORDS,
      event({ type: 'annotation.created', page: square.page, annotation: square }),
    );
    expect(versionOf(records)).toBe(1);
  });

  it('an update advances the version only when the engine re-baked the appearance', () => {
    const records = recordsOf(square);
    const updated = (changed: boolean) =>
      event({
        type: 'annotation.updated',
        page: square.page,
        annotation: square,
        appearance: { changed },
      });
    expect(versionOf(applied(records, updated(false)))).toBe(0);
    expect(versionOf(applied(records, updated(true)))).toBe(1);
  });

  it('a z-order move never changes an appearance', () => {
    const records = applied(
      recordsOf(square),
      event({ type: 'annotation.moved', page: square.page, annotations: [square] }),
    );
    expect(versionOf(records)).toBe(0);
  });

  it.each(['form.valueChanged'])('%s repaints the changed widgets', (type) => {
    const records = recordsOf(recordOn(11, 5));
    const next = applied(records, event({ type, changedWidgets: [formWidget(5, toPageRef(11))] }));
    expect(versionOf(next, 'obj:5')).toBe(1);
  });

  it('an import that changed widgets repaints every widget of the imported form', () => {
    const records = recordsOf(recordOn(11, 5), recordOn(12, 6), recordOn(12, 7));
    const snapshot = {
      fields: [
        { widgets: [formWidget(5, toPageRef(11))] },
        { widgets: [formWidget(6, toPageRef(12)), formWidget(7, toPageRef(12))] },
      ],
    };
    const imported = applied(
      records,
      event({ type: 'form.imported', widgetsChanged: 2, snapshot }),
    );
    expect(['obj:5', 'obj:6', 'obj:7'].map((key) => versionOf(imported, key))).toEqual([1, 1, 1]);
    expect(
      foldRecords(records, event({ type: 'form.imported', widgetsChanged: 0, snapshot })),
    ).toBe(records);
  });

  it('a signature repaints its widget', () => {
    const records = recordsOf(recordOn(11, 5));
    const next = applied(
      records,
      event({ type: 'signature.completed', signature: { widget: formWidget(5, toPageRef(11)) } }),
    );
    expect(versionOf(next, 'obj:5')).toBe(1);
  });
});

describe('weak annotations (addressed by position)', () => {
  const page = toPageRef(11);

  it('an update that made the engine name a weak record moves it to its new key, in place', () => {
    const weak = weakOn(11, 3);
    const records = recordsOf(weak, recordOn(11, 7));
    const next = applied(
      records,
      event({
        type: 'annotation.updated',
        page,
        annotation: named(weak, 'u-1'),
        appearance: { changed: true },
      }),
    );
    expect(next.order).toEqual(['nm:11:u-1', 'obj:7']);
    expect(Object.keys(next.byKey).sort()).toEqual(['nm:11:u-1', 'obj:7']);
    expect(next.byKey['nm:11:u-1']!.apVersion).toBe(1);
  });

  it('an update of a known record on a weak page is applied, not re-read', () => {
    const records = recordsOf(weakOn(11, 3), recordOn(11, 7));
    const next = foldRecords(
      records,
      event({
        type: 'annotation.updated',
        page,
        annotation: recordOn(11, 7),
        appearance: { changed: false },
        meta: { changed: [{ kind: 'objectNumber', value: 7 }], shouldRefetch: null },
      }),
    );
    expect(next).not.toEqual(reload({ pages: [page] }));
  });

  it('a change the engine says moved positions re-reads the page', () => {
    const records = recordsOf(weakOn(11, 3));
    const deleted = event({
      type: 'annotation.deleted',
      page,
      deleted: null,
      meta: { changed: [], shouldRefetch: { reason: 'weakRefsInvalidated' } },
    });
    expect(foldRecords(records, deleted)).toEqual(reload({ pages: [page] }));
  });

  it('a reply whose weak parent the engine named re-reads the page', () => {
    const records = recordsOf(weakOn(11, 3));
    const reply = recordOn(11, 9);
    const created = event({
      type: 'annotation.created',
      page,
      annotation: reply,
      meta: {
        changed: [
          { kind: 'objectNumber', value: 9 },
          { kind: 'nm', value: 'u-2' },
        ],
        shouldRefetch: null,
      },
    });
    expect(foldRecords(records, created)).toEqual(reload({ pages: [page] }));
  });

  it('pages without weak records never re-read for a name they do not know', () => {
    const records = recordsOf(recordOn(11, 7));
    const next = foldRecords(
      records,
      event({
        type: 'annotation.created',
        page,
        annotation: recordOn(11, 9),
        meta: { changed: [{ kind: 'nm', value: 'elsewhere' }], shouldRefetch: null },
      }),
    );
    expect((next as AnnotationRecords).order).toEqual(['obj:7', 'obj:9']);
  });
});

describe('records mirror through the controller', () => {
  it('a form value write bumps the repainted widget appearance version', async () => {
    const harness = annotationHarness();
    const widget = {
      ...recordOn(1, 5),
      index: 0,
      identityQuality: 'durable',
      nm: null,
      print: true,
      contents: null,
      rect: { left: 100, bottom: 700, right: 180, top: 760 },
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      strokeWidth: 1,
      reply: null,
      popup: null,
      groupId: null,
      userId: null,
      createdBy: null,
      modifiedBy: null,
      importedBy: null,
      actions: null,
    } as unknown as AnnotationDTO;
    harness.listAll.mockResolvedValueOnce({
      annotations: [widget],
      pages: [{ page: toPageRef(1) }],
    });
    harness.connectAll();
    await harness.capability.whenSynced();
    expect(harness.model().byId['obj:5']?.apVersion ?? 0).toBe(0);
    harness.emit(
      event({ type: 'form.valueChanged', changedWidgets: [formWidget(5, toPageRef(1))] }),
    );
    expect(harness.model().byId['obj:5']?.apVersion).toBe(1);
  });
});

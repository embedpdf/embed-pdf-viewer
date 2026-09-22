import type { DocumentEvent } from '@embedpdf/core';
import { reload } from '@embedpdf/core';
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';
import { annotationKey, formWidget, toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { foldRecords, widgetsRepaintedBy, type RecordIndex } from '../../src/sync/records';
import { annotationHarness } from '../harness';

/**
 * The records mirror: a pure fold over confirmed events from every origin,
 * page re-reads for events that describe annotations too coarsely, and the
 * widget repaints that change pixels without changing records.
 */
const event = (partial: Record<string, unknown>): DocumentEvent =>
  ({
    origin: { kind: 'remote', sessionId: 'them', sub: null, ts: 0, serverId: 45 },
    ...partial,
  }) as unknown as DocumentEvent;

const recordOn = (pageObjectNumber: number, annotObjectNumber: number): AnnotationDTO =>
  ({
    ref: { kind: 'objectNumber', page: toPageRef(pageObjectNumber), annotObjectNumber },
    page: toPageRef(pageObjectNumber),
    subtype: 'square',
  }) as unknown as AnnotationDTO;

const indexOf = (...records: AnnotationDTO[]): RecordIndex =>
  Object.fromEntries(records.map((record) => [annotationKey(record.ref), record]));

describe('foldRecords', () => {
  it('upserts created, updated and moved records and removes deleted ones', () => {
    const one = recordOn(11, 1);
    let index = foldRecords(
      {},
      event({ type: 'annotation.created', page: one.page, created: one }),
    ) as RecordIndex;
    expect(Object.keys(index)).toEqual(['obj:1']);
    index = foldRecords(
      index,
      event({
        type: 'annotation.deleted',
        page: one.page,
        deleted: { kind: 'objectNumber', value: 1 },
      }),
    ) as RecordIndex;
    expect(index).toEqual({});
  });

  it('drops the records of deleted pages', () => {
    const index = indexOf(recordOn(11, 1), recordOn(12, 2));
    const next = foldRecords(index, event({ type: 'pages.deleted', pages: [toPageRef(12)] }));
    expect(Object.keys(next as RecordIndex)).toEqual(['obj:1']);
  });

  it('re-reads inserted pages and the pages a redaction applied to', () => {
    expect(
      foldRecords(
        {},
        event({ type: 'pages.inserted', insertedPages: [toPageRef(21), toPageRef(22)] }),
      ),
    ).toEqual(reload({ pages: [toPageRef(21), toPageRef(22)] }));
    expect(
      foldRecords(
        {},
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
    expect(foldRecords({}, event({ type: 'pages.flattened', results }))).toEqual(
      reload({ pages: [toPageRef(11)] }),
    );
    const page = toPageRef(12);
    expect(
      foldRecords(
        {},
        event({ type: 'annotations.flattened', page, results: [{ status: 'applied' }] }),
      ),
    ).toEqual(reload({ pages: [page] }));
    const index = indexOf(recordOn(12, 3));
    expect(
      foldRecords(
        index,
        event({ type: 'annotations.flattened', page, results: [{ status: 'skipped' }] }),
      ),
    ).toBe(index);
  });

  it('re-reads everything after a form repair that linked widgets or baked appearances', () => {
    const index = indexOf(recordOn(11, 1));
    const repair = (widgetsLinked: number, appearancesBaked: number) =>
      event({ type: 'form.repaired', widgetsLinked, appearancesBaked });
    expect(foldRecords(index, repair(1, 0))).toEqual(reload());
    expect(foldRecords(index, repair(0, 2))).toEqual(reload());
    expect(foldRecords(index, repair(0, 0))).toBe(index);
  });

  it('re-reads the pages of a new form field, from any session', () => {
    expect(
      foldRecords(
        {},
        event({ type: 'form.fieldCreated', field: { widgets: [formWidget(5, toPageRef(11))] } }),
      ),
    ).toEqual(reload({ pages: [toPageRef(11)] }));
  });
});

describe('widgetsRepaintedBy', () => {
  it.each(['form.valueChanged', 'form.effectsApplied'])(
    '%s repaints the changed widgets',
    (type) => {
      const ids = widgetsRepaintedBy(
        event({ type, changedWidgets: [formWidget(5, toPageRef(11))] }),
      );
      expect(ids).toEqual([
        annotationKey({ kind: 'objectNumber', page: toPageRef(11), annotObjectNumber: 5 }),
      ]);
    },
  );

  it('an import that changed widgets repaints every widget of the imported form', () => {
    const snapshot = {
      fields: [
        { widgets: [formWidget(5, toPageRef(11))] },
        { widgets: [formWidget(6, toPageRef(12)), formWidget(7, toPageRef(12))] },
      ],
    };
    expect(
      widgetsRepaintedBy(event({ type: 'form.imported', widgetsChanged: 2, snapshot })),
    ).toEqual(['obj:5', 'obj:6', 'obj:7']);
    expect(
      widgetsRepaintedBy(event({ type: 'form.imported', widgetsChanged: 0, snapshot })),
    ).toEqual([]);
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
      flags: { print: true },
      contents: null,
      rect: { left: 100, bottom: 700, right: 180, top: 760 },
      color: { r: 0, g: 0, b: 0 },
      opacity: 1,
      strokeWidth: 1,
      inReplyTo: null,
      replyType: null,
    } as unknown as AnnotationDTO;
    harness.listRawAll.mockResolvedValueOnce({
      pages: [{ pageState: { page: toPageRef(1) }, annotations: [widget] }],
    });
    harness.connectAll();
    await harness.capability.whenSynced();
    expect(harness.state().model.byId['obj:5']?.apVersion ?? 0).toBe(0);
    harness.emit(
      event({ type: 'form.valueChanged', changedWidgets: [formWidget(5, toPageRef(1))] }),
    );
    expect(harness.state().model.byId['obj:5']?.apVersion).toBe(1);
  });
});

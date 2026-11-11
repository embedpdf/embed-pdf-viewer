import { describe, expect, test } from 'vitest';
import type { Annotation } from '../../src/annotation/kinds';
import type { AnnotationRef } from '../../src/identity/AnnotationRef';
import { toPageRef, type PageRef } from '../../src/identity/PageRef';
import { planAnnotationCopies } from '../../src/transfer/annotationCopy';
import { planAnnotationCopy } from '../../src/transfer/planAnnotationCopy';

const box = { x: 10, y: 10, width: 30, height: 20 };
const page = toPageRef(3);
const refOf = (annotObjectNumber: number, on: PageRef = page): AnnotationRef => ({
  kind: 'objectNumber',
  page: on,
  objectNumber: annotObjectNumber,
});

/** An annotation as a read returns it, with the fields a copy checks. */
function annotation(annotObjectNumber: number, fields: Record<string, unknown> = {}): Annotation {
  return {
    subtype: 'square',
    ref: refOf(annotObjectNumber),
    page,
    hasAppearance: true,
    appearanceState: null,
    nm: null,
    rect: box,
    ...(fields.subtype === undefined ? { box } : {}),
    reply: null,
    popup: null,
    ...fields,
  } as unknown as Annotation;
}

const linePoints = { start: { x: 0, y: 0 }, end: { x: 1, y: 1 } };

describe('a field that marks something the engine can’t write', () => {
  const geo = annotation(10, { subtype: 'line', measure: { subtype: 'geospatial' }, linePoints });
  const unknown = annotation(11, { subtype: 'line', measure: { subtype: 'unknown' }, linePoints });
  const script = annotation(12, { subtype: 'link', target: { kind: 'javascript' } });
  const scale = {
    subtype: 'rectilinear',
    x: [{ unit: 'm', conversion: 1 }],
    distance: [{ unit: 'm', conversion: 1 }],
    area: [],
  };
  const measured = annotation(13, { subtype: 'line', measure: scale, linePoints });

  test('is left out of the copy, which is made without it', () => {
    const { copies, dropped } = planAnnotationCopies([geo, unknown, script, measured], {});
    expect(copies.map((copy) => copy.source)).toEqual([0, 1, 2, 3]);
    expect(copies[0]!.data).not.toHaveProperty('measure');
    expect(copies[1]!.data).not.toHaveProperty('measure');
    expect(copies[2]!.data).not.toHaveProperty('target');
    // A measure a write can make is the copy's too.
    expect(copies[3]!.data).toHaveProperty('measure', scale);
    // Nothing is left out whole: what a copy leaves out of one is the engine's to report.
    expect(dropped).toEqual([]);
  });

  test('is reported by the engine, field by field', () => {
    const { creates, dropped } = planAnnotationCopy([geo, unknown, script], {});
    expect(creates).toHaveLength(3);
    expect(creates[0]!.draft).toHaveProperty('measure', null);
    expect(creates[2]!.draft).toHaveProperty('target', null);
    expect(dropped).toEqual([
      { ref: geo.ref, field: 'measure', reason: 'geospatial' },
      { ref: unknown.ref, field: 'measure', reason: 'unknown-measure' },
      { ref: script.ref, field: 'target', reason: 'unsupported-action' },
    ]);
  });
});

import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  openUnionOf,
  openUnionsIn,
  readingProblems,
  UNKNOWN_FIELD,
  withUnknownFields,
} from '../../src/conformance';
import {
  AnnotationAppearanceBatchSchema,
  AnnotationListSchema,
  AnnotationSchema,
  closed,
  EditSessionStatusSchema,
  EngineErrorSchema,
  FormFieldDTOSchema,
  FormSnapshotSchema,
  PdfLinkTargetSchema,
  PdfMeasurementSchema,
  readsUnknownAs,
} from '../../src/wire';

const page = { kind: 'objectNumber', objectNumber: 3 };

/** A square annotation as a server sends it. */
const square = {
  subtype: 'square',
  ref: { kind: 'objectNumber', page, objectNumber: 9 },
  page,
  hasAppearance: true,
  appearanceState: null,
  structurePosition: null,
  nm: 'shape',
  rect: { x: 10, y: 20, width: 30, height: 40 },
  box: { x: 10, y: 20, width: 30, height: 40 },
  rotation: null,
  contents: null,
  subject: null,
  blendMode: 'normal',
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
  reply: null,
  popup: null,
  groupId: null,
  author: 'Ada',
  createdAt: null,
  modifiedAt: null,
  userId: null,
  createdBy: null,
  modifiedBy: null,
  importedBy: null,
  actions: null,
  richText: null,
  color: '#ff0000',
  opacity: 1,
  strokeWidth: 1,
  borderStyle: 'solid',
  dashArray: null,
  interiorColor: null,
  cloudyIntensity: null,
};

describe('an annotation of a kind the client does not know', () => {
  test('the fixture is a valid square', () => {
    expect(AnnotationSchema.parse(square)).toMatchObject({ subtype: 'square' });
  });

  test('reads as unsupported, keeping the fields every annotation has', () => {
    const sound = { ...square, subtype: 'sound', soundFormat: 'wav' };
    const read = AnnotationSchema.parse(sound);
    expect(read).toMatchObject({
      subtype: 'unsupported',
      ref: square.ref,
      rect: square.rect,
      author: 'Ada',
      rawSubtypeCode: 0,
      rawSubtypeName: null,
    });
    expect(read).not.toHaveProperty('soundFormat');
    expect(read).not.toHaveProperty('box');
  });

  test('takes rawSubtypeCode and rawSubtypeName from the body when it carries them', () => {
    const sound = { ...square, subtype: 'sound', rawSubtypeCode: 18, rawSubtypeName: 'Sound' };
    expect(AnnotationSchema.parse(sound)).toMatchObject({
      subtype: 'unsupported',
      rawSubtypeCode: 18,
      rawSubtypeName: 'Sound',
    });
  });

  test('does not fail the list it is in', () => {
    const list = AnnotationListSchema.parse({
      annotations: [square, { ...square, subtype: 'sound' }],
      pages: [page],
    }) as { annotations: Array<{ subtype: string }> };
    expect(list.annotations.map((annotation) => annotation.subtype)).toEqual([
      'square',
      'unsupported',
    ]);
  });

  test('still fails when the fields every annotation has are malformed', () => {
    expect(AnnotationSchema.safeParse({ ...square, subtype: 'sound', rect: 'wide' }).success).toBe(
      false,
    );
  });

  test('a subtype that is not a string is malformed, not unknown', () => {
    expect(AnnotationSchema.safeParse({ ...square, subtype: 7 }).success).toBe(false);
  });
});

describe('an annotation of a kind the client knows', () => {
  test('still fails when its own fields are malformed', () => {
    expect(AnnotationSchema.safeParse({ ...square, strokeWidth: 'thick' }).success).toBe(false);
    expect(AnnotationSchema.safeParse({ ...square, interiorColor: undefined }).success).toBe(false);
  });

  test('ignores a field it does not know, nested ones included', () => {
    const read = AnnotationSchema.parse(withUnknownFields(AnnotationSchema, square));
    expect(read).toEqual(AnnotationSchema.parse(square));
    expect(JSON.stringify(read)).not.toContain(UNKNOWN_FIELD);
  });
});

describe('the other sets with a catch-all', () => {
  test('an error code the client does not know reads as Unknown', () => {
    const error = { code: 'QuotaExceeded', message: 'too many' };
    expect(EngineErrorSchema.parse(error).code).toBe('Unknown');
    expect(EngineErrorSchema.safeParse({ ...error, code: 42 }).success).toBe(false);
  });

  test('a measure, a link target and a form field read as their catch-all', () => {
    expect(PdfMeasurementSchema.parse({ subtype: 'polar', origin: 1 })).toEqual({
      subtype: 'unknown',
    });
    expect(PdfLinkTargetSchema.parse({ kind: 'goto-3d', view: 'front' })).toEqual({
      kind: 'unsupported',
    });
    const field = FormFieldDTOSchema.safeParse({ family: 'barcode' });
    // A field reads the fields every field has, so a bare one is still malformed.
    expect(field.success).toBe(false);
  });

  test('an open enum reads an unknown value as its fallback and refuses a malformed one', () => {
    const tone = readsUnknownAs(z.enum(['plain', 'loud', 'other']), 'other');
    expect(tone.parse('whisper')).toBe('other');
    expect(tone.parse('loud')).toBe('loud');
    expect(tone.safeParse(3).success).toBe(false);
  });
});

describe('the fixtures every generated SDK reads', () => {
  // fern/scripts/check-tolerant-reading.mjs reads them with each SDK; reading
  // them here keeps them valid responses from a newer server as the contract grows.
  const fixture = (name: string): unknown =>
    JSON.parse(
      readFileSync(
        new URL(`../../../../../fern/tolerant-reading/${name}`, import.meta.url),
        'utf8',
      ),
    );

  test('the annotation list reads each kind it does not know as its catch-all', () => {
    const list = AnnotationListSchema.parse(fixture('annotation-list.json')) as {
      annotations: Array<Record<string, any>>;
    };
    expect(list.annotations.map(({ subtype }) => subtype)).toEqual([
      'square',
      'unsupported',
      'widget',
      'line',
      'link',
    ]);
    const [, , widget, line, link] = list.annotations;
    expect(widget!.fieldKind).toBe('unknown');
    expect(line!.measure).toEqual({ subtype: 'unknown' });
    expect(link!.target).toEqual({ kind: 'unsupported' });
    expect(link!.actions.activate.root).toMatchObject({ type: 'unknown', next: [] });
  });

  test('the form reads a field of an unknown kind and a value of an unknown kind', () => {
    const form = FormSnapshotSchema.parse(fixture('form.json')) as {
      fields: Array<Record<string, any>>;
    };
    expect(form.fields.map(({ kind }) => kind)).toEqual(['text', 'unknown']);
    expect(form.fields[0]!.valueEntry).toEqual({ kind: 'unsupported' });
    expect(form.fields[1]).toMatchObject({ name: 'Ticket', rawValue: '' });
  });
});

describe('openUnionOf and openUnionsIn', () => {
  test('name a union with a catch-all and every one a response carries', () => {
    expect(openUnionOf(FormFieldDTOSchema)).toMatchObject({ tag: 'kind', catchAll: 'unknown' });
    expect(openUnionOf(FormSnapshotSchema)).toBeUndefined();
    expect(openUnionsIn(FormSnapshotSchema).map(({ tag, catchAll }) => [tag, catchAll])).toEqual(
      expect.arrayContaining([
        ['kind', 'unknown'],
        ['kind', 'unsupported'],
        ['type', 'unknown'],
      ]),
    );
  });
});

describe('readingProblems', () => {
  test('names an object that refuses unknown fields and a set that says nothing', () => {
    const response = z.object({
      strict: z.object({ a: z.string() }).strict(),
      mode: z.enum(['a', 'b']),
      ok: closed(z.enum(['c', 'd'])),
    });
    expect(readingProblems(response)).toEqual([
      'response.strict: refuses unknown fields',
      'response.mode: ["a","b"] is neither closed nor read with a fallback',
    ]);
  });

  // These two arrive outside a JSON response body (a multipart part and an
  // event stream), so the cloud engine's suite doesn't see them parsed.
  test('the appearance batch and the edit session status read tolerantly', () => {
    expect(readingProblems(AnnotationAppearanceBatchSchema)).toEqual([]);
    expect(readingProblems(EditSessionStatusSchema)).toEqual([]);
  });
});

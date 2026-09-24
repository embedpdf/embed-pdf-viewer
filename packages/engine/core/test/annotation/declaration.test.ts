import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import {
  defineKind,
  field,
  type CreateOf,
  type ReadOf,
  type UpdateOf,
} from '../../src/annotation/declaration';

const note = defineKind(
  'note',
  {
    ref: field.engine(z.string()),
    author: field.attribution(z.string()).nullable(),
    actions: field.preserved(z.object({ activate: z.string() })).nullable(),
    nm: field.data(z.string()).nullable().optional().createOnly(),
    rect: field.data(z.object({ left: z.number(), right: z.number() })),
    contents: field.data(z.string()).nullable().optional(),
    hidden: field.data(z.boolean()).optional(),
    body: field
      .data(z.object({ text: z.string(), style: z.string() }))
      .writes(z.object({ text: z.string(), style: z.string().optional() }))
      .optional(),
    file: field.data(z.object({ name: z.string() })).nullableOnRead(),
  },
  { file: 'required' },
);

type NoteRead = ReadOf<typeof note>;
type NoteCreate = CreateOf<typeof note>;
type NoteUpdate = UpdateOf<typeof note>;

const read: NoteRead = {
  subtype: 'note',
  ref: 'r1',
  author: 'Alice',
  actions: null,
  nm: 'n1',
  rect: { left: 0, right: 10 },
  contents: null,
  hidden: false,
  body: { text: 'Hi', style: 'bold' },
  file: { name: 'a.pdf' },
};

describe('defineKind', () => {
  test('a read requires every field and drops undeclared ones', () => {
    expect(note.readSchema.safeParse(read).success).toBe(true);
    const { contents: _contents, ...missing } = read;
    expect(note.readSchema.safeParse(missing).success).toBe(false);
    expect(note.readSchema.parse({ ...read, extra: 1 })).toEqual(read);
  });

  test('a read accepts null only for nullable fields', () => {
    expect(note.readSchema.safeParse({ ...read, file: null }).success).toBe(true);
    expect(note.readSchema.safeParse({ ...read, rect: null }).success).toBe(false);
  });

  test('a create requires data fields without a default', () => {
    expect(
      note.createSchema.safeParse({
        subtype: 'note',
        rect: { left: 0, right: 1 },
        file: { name: 'a' },
      }).success,
    ).toBe(true);
    expect(note.createSchema.safeParse({ subtype: 'note', file: { name: 'a' } }).success).toBe(
      false,
    );
  });

  test('a create and an update accept a read of the same kind', () => {
    expect(note.createSchema.safeParse(read).success).toBe(true);
    expect(note.updateSchema.safeParse(read).success).toBe(true);
    const box = defineKind('box', {
      ref: field.engine(z.string()),
      rect: field.data(z.number()),
      contents: field.data(z.string()).nullable().optional(),
    });
    const boxRead: ReadOf<typeof box> = { subtype: 'box', ref: 'r1', rect: 1, contents: null };
    const asCreate: CreateOf<typeof box> = boxRead;
    const asUpdate: UpdateOf<typeof box> = boxRead;
    // @ts-expect-error a read whose file may be null can't be created without a file
    const noteAsCreate: NoteCreate = read;
    expect([asCreate, asUpdate, noteAsCreate]).toHaveLength(3);
  });

  test('a create refuses null where only the read may be null', () => {
    expect(note.createSchema.safeParse({ ...read, file: null }).success).toBe(false);
  });

  test('a write uses the write schema of a field', () => {
    expect(
      note.createSchema.safeParse({
        subtype: 'note',
        rect: { left: 0, right: 1 },
        file: { name: 'a' },
        body: { text: 'no style' },
      }).success,
    ).toBe(true);
  });

  test('an update makes every field optional, including the subtype', () => {
    expect(note.updateSchema.safeParse({}).success).toBe(true);
    expect(note.updateSchema.safeParse({ hidden: true }).success).toBe(true);
    expect(note.updateSchema.safeParse({ subtype: 'note', contents: null }).success).toBe(true);
    expect(note.updateSchema.safeParse({ subtype: 'other' }).success).toBe(false);
    expect(note.updateSchema.safeParse({ colour: 'red' }).success).toBe(false);
  });

  test('an update refuses null for a field that can not be absent', () => {
    expect(note.updateSchema.safeParse({ rect: null }).success).toBe(false);
    expect(note.updateSchema.safeParse({ hidden: null }).success).toBe(false);
  });

  test('traits record who writes each field', () => {
    expect(note.fields.ref.traits.owner).toBe('engine');
    expect(note.fields.author.traits.owner).toBe('attribution');
    expect(note.fields.actions.traits.owner).toBe('preserved');
    expect(note.fields.nm.traits).toMatchObject({
      owner: 'data',
      createOnly: true,
      required: false,
    });
    expect(note.fields.rect.traits).toMatchObject({ required: true, readNullable: false });
    expect(note.resources).toEqual({ file: 'required' });
  });
});

describe('derived types', () => {
  test('match the declaration', () => {
    const create: NoteCreate = {
      subtype: 'note',
      rect: { left: 0, right: 1 },
      file: { name: 'a' },
    };
    // @ts-expect-error rect has no default
    const missingRect: NoteCreate = { subtype: 'note', file: { name: 'a' } };
    // @ts-expect-error contents is not a boolean
    const wrongType: NoteUpdate = { contents: true };
    // @ts-expect-error hidden can't be absent
    const nullFlag: NoteUpdate = { hidden: null };
    const update: NoteUpdate = { contents: null, nm: 'n1', ref: 'ignored' };
    expect([create, missingRect, wrongType, nullFlag, update]).toHaveLength(5);
  });
});

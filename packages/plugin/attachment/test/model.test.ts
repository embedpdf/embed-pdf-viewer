import {
  toAttachmentRef,
  type Attachment,
  type DocumentEvent,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { freeName } from '../src/model';
import { displayNameOf } from '../src/names';
import { foldFiles, predictFiles, undoOf } from '../src/sync/files';

const fileNamed = (key: string, index = 0): Attachment => ({
  ref: toAttachmentRef(key),
  index,
  name: key,
  mimeType: 'text/plain',
  description: null,
  size: 4,
  checksum: '098f6bcd4621d373cade4e832627b4f6',
  createdAt: null,
  modifiedAt: null,
});
const keysOf = (files: readonly Attachment[] | null) =>
  files?.map((file) => `${file.index}:${file.ref.key}`);

describe('names', () => {
  it('numbers a name a file has, before its extension', () => {
    expect(freeName('notes.txt', new Set())).toBe('notes.txt');
    expect(freeName('notes.txt', new Set(['notes.txt']))).toBe('notes (2).txt');
    expect(freeName('notes.txt', new Set(['notes.txt', 'notes (2).txt']))).toBe('notes (3).txt');
    expect(freeName('README', new Set(['README']))).toBe('README (2)');
    expect(freeName('.env', new Set(['.env']))).toBe('.env (2)');
  });

  it('shows a name without control characters and bidi controls', () => {
    const rlo = String.fromCharCode(0x202e);
    expect(displayNameOf({ name: `invoice${rlo}fdp.exe` })).toBe('invoicefdp.exe');
    expect(displayNameOf({ name: ` a${String.fromCharCode(0)}b.txt\n` })).toBe('ab.txt');
    expect(displayNameOf({ name: String.fromCharCode(0x200f) })).toBe('attachment');
    expect(displayNameOf({ name: 'Résumé 2026.pdf' })).toBe('Résumé 2026.pdf');
  });
});

describe('files', () => {
  const files = [fileNamed('a.txt', 0), fileNamed('c.txt', 1)];
  const event = (fields: object) => ({ origin: { kind: 'remote' }, ...fields }) as DocumentEvent;

  it('folds an added file into its place by key, and a removed one out, numbering them again', () => {
    const added = foldFiles(
      files,
      event({ type: 'attachments.created', attachment: fileNamed('b.txt') }),
    );
    expect(keysOf(added)).toEqual(['0:a.txt', '1:b.txt', '2:c.txt']);
    // Files whose place held keep their objects.
    expect(added![0]).toBe(files[0]);
    const removed = foldFiles(
      added,
      event({ type: 'attachments.deleted', deleted: toAttachmentRef('a.txt') }),
    );
    expect(keysOf(removed)).toEqual(['0:b.txt', '1:c.txt']);
    const restored = foldFiles(
      removed,
      event({ type: 'attachments.restored', attachment: fileNamed('a.txt') }),
    );
    expect(keysOf(restored)).toEqual(['0:a.txt', '1:b.txt', '2:c.txt']);
    expect(foldFiles(null, event({ type: 'attachments.created', attachment: files[0] }))).toBe(
      null,
    );
  });

  it('shows an add of a free name with its size, and leaves a taken one alone', () => {
    const create = {
      type: 'attachments.create',
      file: { name: 'b.txt', mimeType: 'text/csv' },
      resources: { file: new Uint8Array(7) },
    } as const;
    const shown = predictFiles(files, create);
    expect(keysOf(shown)).toEqual(['0:a.txt', '1:b.txt', '2:c.txt']);
    expect(shown![1]).toMatchObject({
      name: 'b.txt',
      mimeType: 'text/csv',
      size: 7,
      checksum: null,
    });
    expect(predictFiles(files, { ...create, file: { name: 'a.txt' } })).toBe(files);
    expect(
      predictFiles(files, { type: 'attachments.delete', ref: toAttachmentRef('none.txt') }),
    ).toBe(files);
  });

  it('undoes an add with a remove, and a remove with the file as it was, last op first', () => {
    const undo = undoOf(files, [
      {
        type: 'attachments.create',
        file: { name: 'b.txt' },
        resources: { file: new Uint8Array(1) },
      },
      { type: 'attachments.delete', ref: toAttachmentRef('c.txt') },
    ]);
    // The remove meets the files the add left: `c.txt` is third by then.
    expect(undo).toEqual([
      { type: 'attachments.restore', attachment: { ...files[1], index: 2 } },
      { type: 'attachments.delete', ref: toAttachmentRef('b.txt') },
    ]);
    // The undo of a remove shows the file again, in its place.
    expect(keysOf(predictFiles([files[0]!], undo[0]!))).toEqual(['0:a.txt', '1:c.txt']);
  });
});

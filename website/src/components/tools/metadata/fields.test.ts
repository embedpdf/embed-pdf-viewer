import { describe, expect, it } from 'vitest';

import {
  customKeyProblem,
  customPatch,
  formValues,
  fromLocalInput,
  hasXmp,
  metadataPatch,
  toLocalInput,
  type Metadata,
} from './fields';

const read: Metadata = {
  title: 'Q2 report',
  author: 'Dana Smith',
  subject: null,
  keywords: 'finance, q2',
  creator: 'Word',
  producer: 'macOS Quartz',
  createdAt: '2026-04-01T09:30:15Z',
  modifiedAt: null,
  trapped: 'unknown',
};

describe('the form values', () => {
  it('shows empty fields as empty text and dates in local time', () => {
    const values = formValues(read);
    expect(values.subject).toBe('');
    expect(values.modifiedAt).toBe('');
    expect(fromLocalInput(values.createdAt)!.toISOString()).toBe('2026-04-01T09:30:15.000Z');
  });

  it('reads back what it wrote, and nothing for an empty or broken date', () => {
    expect(toLocalInput(null)).toBe('');
    expect(toLocalInput('not a date')).toBe('');
    expect(fromLocalInput('')).toBeNull();
    expect(fromLocalInput('nonsense')).toBeNull();
  });
});

describe('metadataPatch', () => {
  it('sends only what changed', () => {
    const original = formValues(read);
    expect(metadataPatch(original, original)).toEqual({});
    expect(metadataPatch(original, { ...original, title: 'Q2 report (final)' })).toEqual({
      title: 'Q2 report (final)',
    });
  });

  it('removes an emptied field instead of writing empty text', () => {
    const original = formValues(read);
    expect(metadataPatch(original, { ...original, author: '', keywords: '   ' })).toEqual({
      author: null,
      keywords: null,
    });
  });

  it('writes a changed date as a date, an emptied one as a removal, and the trapping', () => {
    const original = formValues(read);
    const patch = metadataPatch(original, {
      ...original,
      createdAt: '',
      modifiedAt: '2026-05-02T10:00:00',
      trapped: 'true',
    });
    expect(patch.createdAt).toBeNull();
    expect(patch.modifiedAt).toEqual(new Date('2026-05-02T10:00:00'));
    expect(patch.trapped).toBe('true');
  });
});

describe('fields of their own', () => {
  it('removes, adds, changes and renames', () => {
    const original = { reviewedBy: 'dana', draftOwner: 'sam', contract: 'C-1' };
    expect(
      customPatch(original, [
        { id: 'a', key: 'reviewedBy', value: 'lee' },
        { id: 'b', key: 'contractId', value: 'C-1' },
        { id: 'c', key: '  ', value: 'no name, left out' },
      ]),
    ).toEqual({ draftOwner: null, contract: null, reviewedBy: 'lee', contractId: 'C-1' });
  });

  it('says what is wrong with a name', () => {
    expect(customKeyProblem('reviewedBy', [])).toBeNull();
    expect(customKeyProblem('', [])).toBe('Give the field a name.');
    expect(customKeyProblem('has space', [])).toMatch(/without spaces/);
    expect(customKeyProblem('Ünï', [])).toMatch(/accents/);
    expect(customKeyProblem('/Title', [])).toMatch(/slash/);
    expect(customKeyProblem('Author', [])).toMatch(/fields above/);
    expect(customKeyProblem('ModDate', [])).toMatch(/fields above/);
    expect(customKeyProblem('x'.repeat(128), [])).toMatch(/127/);
    expect(customKeyProblem('reviewedBy', ['reviewedBy'])).toMatch(/Another field/);
  });
});

describe('hasXmp', () => {
  it('finds the XMP packet a file carries as text', () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(hasXmp(encode('%PDF-1.7 ... <x:xmpmeta xmlns:x="adobe:ns:meta/"> ...'))).toBe(true);
    expect(hasXmp(encode('%PDF-1.7 no packet here'))).toBe(false);
  });
});

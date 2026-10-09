import { describe, expect, it } from 'vitest';

import { decodePdfBits, expandRawScope, type DocCapability } from '../../../src/auth/scope';

/**
 * `pdf.permissions` grants what Acrobat allows on a file with these
 * permission bits. Each row is a password-protected file checked in
 * Acrobat Pro 26.002 (Document Restrictions Summary and Prepare Form),
 * opened without the owner password. Bits 3, 5, 10 and 12 are on in
 * every row; the row names the bits of 4, 6, 9 and 11 that are on.
 */
// prettier-ignore
const ACROBAT: ReadonlyArray<{
  bits: string;
  p: number;
  change: boolean; // Changing the Document
  assemble: boolean; // Document Assembly
  comment: boolean; // Commenting
  fill: boolean; // Filling of form fields
  sign: boolean; // Signing
  designForm: boolean; // Prepare Form edits the existing fields
}> = [
  { bits: 'none', p: 0xfffffad4, change: false, assemble: false, comment: false, fill: false, sign: false, designForm: false },
  { bits: '4', p: 0xfffffadc, change: true, assemble: true, comment: false, fill: true, sign: true, designForm: false },
  { bits: '6', p: 0xfffffaf4, change: false, assemble: false, comment: true, fill: true, sign: true, designForm: false },
  { bits: '9', p: 0xfffffbd4, change: false, assemble: false, comment: false, fill: true, sign: true, designForm: false },
  { bits: '4 + 6', p: 0xfffffafc, change: true, assemble: true, comment: true, fill: true, sign: true, designForm: true },
  { bits: '4 + 9', p: 0xfffffbdc, change: true, assemble: true, comment: false, fill: true, sign: true, designForm: false },
  { bits: '6 + 9', p: 0xfffffbf4, change: false, assemble: false, comment: true, fill: true, sign: true, designForm: false },
  { bits: '4 + 6 + 9', p: 0xfffffbfc, change: true, assemble: true, comment: true, fill: true, sign: true, designForm: true },
  { bits: '4 + 6 + 9 + 11', p: 0xfffffffc, change: true, assemble: true, comment: true, fill: true, sign: true, designForm: true },
];

describe('pdf.permissions grants what Acrobat allows', () => {
  it.each(ACROBAT)('bits $bits', (row) => {
    const granted = expandRawScope(['pdf.permissions'], decodePdfBits(row.p));
    const has = (capability: DocCapability) => granted.has(capability);
    expect({
      change: has('doc.pages.modify') && has('doc.metadata.modify'),
      assemble: has('doc.pages.assemble'),
      comment: has('doc.annotate.modify'),
      fill: has('doc.forms.fill'),
      sign: has('doc.sign'),
      designForm: has('doc.forms.modify'),
    }).toEqual({
      change: row.change,
      assemble: row.assemble,
      comment: row.comment,
      fill: row.fill,
      sign: row.sign,
      designForm: row.designForm,
    });
  });
});

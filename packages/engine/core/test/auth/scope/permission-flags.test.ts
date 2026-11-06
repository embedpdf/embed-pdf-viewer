import { describe, expect, it } from 'vitest';
import { PDF_BITS, permissionFlagsOf } from '../../../src/auth/scope';

describe('permissionFlagsOf', () => {
  it('returns all-false for null input', () => {
    expect(permissionFlagsOf(null)).toEqual({
      print: false,
      modifyContents: false,
      copy: false,
      modifyAnnotations: false,
      fillForms: false,
      copyForAccessibility: false,
      assemble: false,
      printHighQuality: false,
    });
  });

  it('returns all-false for zero', () => {
    const bits = permissionFlagsOf(0);
    expect(Object.values(bits).every((v) => v === false)).toBe(true);
  });

  it('decodes each known bit in isolation', () => {
    expect(permissionFlagsOf(PDF_BITS.PRINT).print).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.MODIFY).modifyContents).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.COPY).copy).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.ANNOTATE_FILL).modifyAnnotations).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.FILL_FORMS).fillForms).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.ACCESSIBILITY).copyForAccessibility).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.ASSEMBLE).assemble).toBe(true);
    expect(permissionFlagsOf(PDF_BITS.PRINT_HIGH).printHighQuality).toBe(true);
  });

  it('does not set neighbouring bits when only one mask is supplied', () => {
    const onlyPrint = permissionFlagsOf(PDF_BITS.PRINT);
    expect(onlyPrint.print).toBe(true);
    expect(onlyPrint.modifyContents).toBe(false);
    expect(onlyPrint.copy).toBe(false);
    expect(onlyPrint.printHighQuality).toBe(false);
  });

  it('decodes a fully-permissive integer (all known bits set)', () => {
    const all =
      PDF_BITS.PRINT |
      PDF_BITS.MODIFY |
      PDF_BITS.COPY |
      PDF_BITS.ANNOTATE_FILL |
      PDF_BITS.FILL_FORMS |
      PDF_BITS.ACCESSIBILITY |
      PDF_BITS.ASSEMBLE |
      PDF_BITS.PRINT_HIGH;
    const bits = permissionFlagsOf(all);
    expect(bits).toEqual({
      print: true,
      modifyContents: true,
      copy: true,
      modifyAnnotations: true,
      fillForms: true,
      copyForAccessibility: true,
      assemble: true,
      printHighQuality: true,
    });
  });

  it('ignores reserved bits (1, 2, 7, 8, 13+)', () => {
    // Set bits 1, 2, 7, 8, 13 only — none of those are in our typed view.
    const reservedOnly = (1 << 0) | (1 << 1) | (1 << 6) | (1 << 7) | (1 << 12);
    const bits = permissionFlagsOf(reservedOnly);
    expect(Object.values(bits).every((v) => v === false)).toBe(true);
  });

  it('matches ISO 32000 bit positions (sanity)', () => {
    // ISO bit numbers are 1-indexed; bit N = (1 << (N - 1))
    expect(PDF_BITS.PRINT).toBe(1 << 2); // bit 3
    expect(PDF_BITS.MODIFY).toBe(1 << 3); // bit 4
    expect(PDF_BITS.COPY).toBe(1 << 4); // bit 5
    expect(PDF_BITS.ANNOTATE_FILL).toBe(1 << 5); // bit 6
    expect(PDF_BITS.FILL_FORMS).toBe(1 << 8); // bit 9
    expect(PDF_BITS.ACCESSIBILITY).toBe(1 << 9); // bit 10
    expect(PDF_BITS.ASSEMBLE).toBe(1 << 10); // bit 11
    expect(PDF_BITS.PRINT_HIGH).toBe(1 << 11); // bit 12
  });
});

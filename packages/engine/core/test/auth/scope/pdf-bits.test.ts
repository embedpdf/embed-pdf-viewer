import { describe, expect, it } from 'vitest';
import { PDF_BITS, decodePdfBits } from '../../../src/auth/scope';

describe('decodePdfBits', () => {
  it('returns all-false for null input', () => {
    expect(decodePdfBits(null)).toEqual({
      bit3: false,
      bit4: false,
      bit5: false,
      bit6: false,
      bit9: false,
      bit10: false,
      bit11: false,
      bit12: false,
    });
  });

  it('returns all-false for zero', () => {
    const bits = decodePdfBits(0);
    expect(Object.values(bits).every((v) => v === false)).toBe(true);
  });

  it('decodes each known bit in isolation', () => {
    expect(decodePdfBits(PDF_BITS.PRINT).bit3).toBe(true);
    expect(decodePdfBits(PDF_BITS.MODIFY).bit4).toBe(true);
    expect(decodePdfBits(PDF_BITS.COPY).bit5).toBe(true);
    expect(decodePdfBits(PDF_BITS.ANNOTATE_FILL).bit6).toBe(true);
    expect(decodePdfBits(PDF_BITS.FILL_FORMS).bit9).toBe(true);
    expect(decodePdfBits(PDF_BITS.ACCESSIBILITY).bit10).toBe(true);
    expect(decodePdfBits(PDF_BITS.ASSEMBLE).bit11).toBe(true);
    expect(decodePdfBits(PDF_BITS.PRINT_HIGH).bit12).toBe(true);
  });

  it('does not set neighbouring bits when only one mask is supplied', () => {
    const onlyPrint = decodePdfBits(PDF_BITS.PRINT);
    expect(onlyPrint.bit3).toBe(true);
    expect(onlyPrint.bit4).toBe(false);
    expect(onlyPrint.bit5).toBe(false);
    expect(onlyPrint.bit12).toBe(false);
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
    const bits = decodePdfBits(all);
    expect(bits).toEqual({
      bit3: true,
      bit4: true,
      bit5: true,
      bit6: true,
      bit9: true,
      bit10: true,
      bit11: true,
      bit12: true,
    });
  });

  it('ignores reserved bits (1, 2, 7, 8, 13+)', () => {
    // Set bits 1, 2, 7, 8, 13 only — none of those are in our typed view.
    const reservedOnly = (1 << 0) | (1 << 1) | (1 << 6) | (1 << 7) | (1 << 12);
    const bits = decodePdfBits(reservedOnly);
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

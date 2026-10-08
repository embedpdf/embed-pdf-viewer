import { describe, expect, it } from 'vitest';

import { cssFontFamilyForFont, mountedFontFamily } from '../src/font-css';

describe('cssFontFamilyForFont', () => {
  it("gives a standard font its family's web stack", () => {
    expect(cssFontFamilyForFont('helvetica-bold')).toBe('Helvetica, Arial, sans-serif');
    expect(cssFontFamilyForFont('times-roman')).toBe('"Times New Roman", Times, serif');
    expect(cssFontFamilyForFont('courier')).toBe('"Courier New", Courier, monospace');
  });

  it("gives a registered key the family its face is mounted under, apart from the page's own", () => {
    expect(mountedFontFamily('brand-sans')).toBe('"epdf-brand-sans"');
    expect(cssFontFamilyForFont('brand-sans')).toBe('"epdf-brand-sans", sans-serif');
  });
});

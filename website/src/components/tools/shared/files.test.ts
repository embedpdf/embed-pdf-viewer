import { describe, expect, it } from 'vitest';

import { baseName, formatSize, looksLikePdf, pageCountLabel } from './files';

const bytes = (text: string) => new TextEncoder().encode(text);

describe('looksLikePdf', () => {
  it('finds the header at the start, or after junk within the first 1 KB', () => {
    expect(looksLikePdf(bytes('%PDF-1.7\n'))).toBe(true);
    expect(looksLikePdf(bytes(`${' '.repeat(600)}%PDF-1.4`))).toBe(true);
  });

  it('refuses other files, and a header past the first 1 KB', () => {
    expect(looksLikePdf(bytes('PK\u0003\u0004 a zip'))).toBe(false);
    expect(looksLikePdf(bytes('%PDF'))).toBe(false);
    expect(looksLikePdf(bytes(`${' '.repeat(1100)}%PDF-1.4`))).toBe(false);
    expect(looksLikePdf(new Uint8Array())).toBe(false);
  });
});

describe('names and labels', () => {
  it('drops .pdf from a name, in any case', () => {
    expect(baseName('Invoice March.PDF')).toBe('Invoice March');
    expect(baseName('  report.pdf ')).toBe('report');
    expect(baseName('.pdf')).toBe('Untitled');
  });

  it('shows sizes the way a file manager does', () => {
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(840 * 1024)).toBe('840 KB');
    expect(formatSize(2.34 * 1024 * 1024)).toBe('2.3 MB');
    expect(formatSize(48.6 * 1024 * 1024)).toBe('49 MB');
  });

  it('counts pages in words', () => {
    expect(pageCountLabel(1)).toBe('1 page');
    expect(pageCountLabel(12)).toBe('12 pages');
  });
});

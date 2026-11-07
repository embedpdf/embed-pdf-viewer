import { describe, expect, it } from 'vitest';

import { blankPdf } from './blank-pdf';
import { formatPageRanges, moveItem, outputFileName, parsePageRanges, sortByName } from './files';
import { looksLikePdf } from '../shared/files';

describe('the merge', () => {
  it('builds on a file that reads as a PDF', () => {
    expect(looksLikePdf(blankPdf())).toBe(true);
  });

  it('saves under one .pdf, without characters a file system refuses', () => {
    expect(outputFileName('merged')).toBe('merged.pdf');
    expect(outputFileName('Q3 report.pdf')).toBe('Q3 report.pdf');
    expect(outputFileName('a/b:c*?')).toBe('a b c.pdf');
    expect(outputFileName('tab\there')).toBe('tab here.pdf');
    expect(outputFileName('   ')).toBe('merged.pdf');
    expect(outputFileName('')).toBe('merged.pdf');
  });
});

describe('order', () => {
  it('sorts numbered files the way people number them', () => {
    const files = ['scan 10.pdf', 'Scan 2.pdf', 'scan 1.pdf'].map((name) => ({ name }));
    expect(sortByName(files).map((file) => file.name)).toEqual([
      'scan 1.pdf',
      'Scan 2.pdf',
      'scan 10.pdf',
    ]);
  });

  it('moves one item and keeps the rest in order', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 9)).toEqual(['a', 'b']);
  });
});

describe('page ranges', () => {
  it('writes chosen pages the way people do', () => {
    expect(formatPageRanges([0, 1, 2, 7])).toBe('1-3, 8');
    expect(formatPageRanges([4])).toBe('5');
    expect(formatPageRanges([0, 2, 4])).toBe('1, 3, 5');
    expect(formatPageRanges([0, 1, 5, 6, 7], '–')).toBe('1–2, 6–8');
    expect(formatPageRanges([])).toBe('');
  });

  it('reads what people type, in page order and once each', () => {
    expect(parsePageRanges('1-3, 8', 12)).toEqual([0, 1, 2, 7]);
    expect(parsePageRanges(' 8 ,1 - 3 ', 12)).toEqual([0, 1, 2, 7]);
    expect(parsePageRanges('2–4; 3', 12)).toEqual([1, 2, 3]);
    expect(parsePageRanges('1 3 5', 12)).toEqual([0, 2, 4]);
    expect(parsePageRanges('', 12)).toEqual([]);
  });

  it('takes a backwards range, an open end and a range past the last page', () => {
    expect(parsePageRanges('5-3', 12)).toEqual([2, 3, 4]);
    expect(parsePageRanges('10-', 12)).toEqual([9, 10, 11]);
    expect(parsePageRanges('-2', 12)).toEqual([0, 1]);
    expect(parsePageRanges('11-40', 12)).toEqual([10, 11]);
  });

  it('refuses what is not pages of this file', () => {
    expect(parsePageRanges('first page', 12)).toBeNull();
    expect(parsePageRanges('0', 12)).toBeNull();
    expect(parsePageRanges('13', 12)).toBeNull();
    expect(parsePageRanges('20-30', 12)).toBeNull();
    expect(parsePageRanges('-', 12)).toBeNull();
    expect(parsePageRanges('1-2-3', 12)).toBeNull();
  });
});

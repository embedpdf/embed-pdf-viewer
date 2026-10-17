/**
 * The Print dialog's page range: page numbers and ranges as people type them, in the document's
 * order, each once; nothing at all for a page the document doesn't have.
 */
import { describe, expect, it } from 'vitest';

import { pagesInRange } from '../../../chrome/src/ui/print-pages';

describe('pagesInRange', () => {
  it('reads pages and ranges, separated by commas', () => {
    expect(pagesInRange('1-3, 5', 10)).toEqual([1, 2, 3, 5]);
    expect(pagesInRange(' 7 ', 10)).toEqual([7]);
    expect(pagesInRange('2 – 4', 10)).toEqual([2, 3, 4]);
  });

  it('prints in the document’s order, each page once', () => {
    expect(pagesInRange('5, 1-3, 2', 10)).toEqual([1, 2, 3, 5]);
  });

  it('takes the commas Chinese, Japanese and Arabic keyboards type', () => {
    expect(pagesInRange('1，3、5،7', 10)).toEqual([1, 3, 5, 7]);
  });

  it('ignores empty parts, but names nothing without a page', () => {
    expect(pagesInRange('1,,2,', 10)).toEqual([1, 2]);
    expect(pagesInRange('', 10)).toBeNull();
    expect(pagesInRange(' , ', 10)).toBeNull();
  });

  it('names nothing for a page the document doesn’t have, or text that isn’t pages', () => {
    expect(pagesInRange('0', 10)).toBeNull();
    expect(pagesInRange('9-11', 10)).toBeNull();
    expect(pagesInRange('4-2', 10)).toBeNull();
    expect(pagesInRange('1-', 10)).toBeNull();
    expect(pagesInRange('one', 10)).toBeNull();
  });
});

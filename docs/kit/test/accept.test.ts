import { describe, expect, it } from 'vitest';

import { prefersMarkdown, shouldShowMarkdownAsText } from '../src/accept';

const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

const request = (headers: Record<string, string>) => new Headers(headers);

describe('shouldShowMarkdownAsText', () => {
  it('is true for a browser that opens the link', () => {
    expect(
      shouldShowMarkdownAsText(request({ 'sec-fetch-mode': 'navigate', accept: BROWSER })),
    ).toBe(true);
    expect(shouldShowMarkdownAsText(request({ 'sec-fetch-mode': 'navigate' }))).toBe(true);
  });

  it('is false for a fetch, as Copy page sends', () => {
    for (const mode of ['cors', 'same-origin', 'no-cors']) {
      expect(shouldShowMarkdownAsText(request({ 'sec-fetch-mode': mode, accept: '*/*' }))).toBe(
        false,
      );
    }
  });

  it('is false without fetch metadata, as agents send', () => {
    expect(shouldShowMarkdownAsText(request({ accept: BROWSER }))).toBe(false);
    expect(shouldShowMarkdownAsText(request({}))).toBe(false);
  });

  it('is false for a navigation that asks for Markdown', () => {
    expect(
      shouldShowMarkdownAsText(request({ 'sec-fetch-mode': 'navigate', accept: 'text/markdown' })),
    ).toBe(false);
  });
});

describe('prefersMarkdown', () => {
  it('is true for a header that names Markdown', () => {
    expect(prefersMarkdown('text/markdown')).toBe(true);
    expect(prefersMarkdown('text/markdown, text/html, */*')).toBe(true);
    expect(prefersMarkdown('TEXT/Markdown; charset=utf-8')).toBe(true);
  });

  it('is true where Markdown ranks above the page', () => {
    expect(
      prefersMarkdown('text/markdown;q=1.0, text/plain;q=0.8, text/html;q=0.7, */*;q=0.1'),
    ).toBe(true);
    expect(prefersMarkdown('text/markdown;q=0.5, text/*;q=0.4')).toBe(true);
  });

  it('is false for a browser, which never names Markdown', () => {
    expect(
      prefersMarkdown(
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      ),
    ).toBe(false);
  });

  it('is false for a wildcard alone, and for no header', () => {
    expect(prefersMarkdown('*/*')).toBe(false);
    expect(prefersMarkdown('text/*')).toBe(false);
    expect(prefersMarkdown('')).toBe(false);
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown(undefined)).toBe(false);
  });

  it('is false where the page ranks above Markdown', () => {
    expect(prefersMarkdown('text/html, text/markdown;q=0.9')).toBe(false);
    // The wildcard gives the page a quality of 1.
    expect(prefersMarkdown('text/markdown;q=0.5, */*')).toBe(false);
  });

  it('is false where the header refuses Markdown', () => {
    expect(prefersMarkdown('text/markdown;q=0, text/html')).toBe(false);
    expect(prefersMarkdown('text/markdown;q=0')).toBe(false);
  });
});

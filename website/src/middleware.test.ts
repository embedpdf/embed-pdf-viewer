import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from './middleware';

/**
 * The docs middleware's Markdown answers: a page's Markdown at `<page>.md`, and at the page's own
 * URL for a request that asks for it in its `Accept` header.
 */

const ORIGIN = 'https://www.embedpdf.com';
const AGENT = 'text/markdown, text/html, */*';
const BROWSER = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';
const QUICK_START = '/docs/headless/react/quick-start';

const answer = (path: string, accept?: string) =>
  middleware(new NextRequest(`${ORIGIN}${path}`, { headers: accept ? { accept } : {} }));

/** The route the middleware answers from in place of the request's own, if it names one. */
const rewrite = (response: Response) => response.headers.get('x-middleware-rewrite');

describe('the docs middleware', () => {
  it('serves a page’s Markdown at its own URL to a request that asks for it', () => {
    const response = answer(QUICK_START, AGENT);

    expect(rewrite(response)).toBe(`${ORIGIN}/api/docs/markdown${QUICK_START}`);
    expect(response.headers.get('vary')).toBe('Accept');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('serves the page to a browser, and says the answer depends on the header', () => {
    const response = answer(QUICK_START, BROWSER);

    expect(rewrite(response)).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('vary')).toBe('Accept');
    // The page a person opens is still the integration the next product opens in.
    expect(response.headers.get('set-cookie')).toContain('=react');
  });

  it('serves the page to a request with no header', () => {
    expect(rewrite(answer(QUICK_START))).toBeNull();
  });

  it('serves the landing’s Markdown at /docs, and a product-less page’s at its URL', () => {
    expect(rewrite(answer('/docs', AGENT))).toBe(`${ORIGIN}/api/docs/markdown/docs`);
    expect(rewrite(answer('/docs/engine/quick-start', AGENT))).toBe(
      `${ORIGIN}/api/docs/markdown/docs/engine/quick-start`,
    );
  });

  it('keeps `<page>.md` as it is, whatever the request asks for', () => {
    for (const accept of [AGENT, BROWSER, undefined]) {
      const response = answer(`${QUICK_START}.md`, accept);

      expect(rewrite(response)).toBe(`${ORIGIN}/api/docs/markdown${QUICK_START}`);
      expect(response.headers.get('vary')).toBeNull();
    }
    expect(rewrite(answer('/docs.md'))).toBe(`${ORIGIN}/api/docs/markdown/docs`);
  });

  it('leaves a file under /docs alone', () => {
    const response = answer('/docs/platform/api-keys.png', AGENT);

    expect(rewrite(response)).toBeNull();
    expect(response.headers.get('vary')).toBeNull();
  });

  it('sends a URL without an integration to one with, for either reader', () => {
    for (const accept of [AGENT, BROWSER]) {
      const response = answer('/docs/headless/quick-start', accept);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(`${ORIGIN}${QUICK_START}`);
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCS_INTEGRATIONS } from './docs-integrations';
import { renderLlms } from './llms';

/**
 * The llms files (`./llms`): `/llms.txt` lists each page once, and `/llms/<integration>.txt`
 * every page one integration has. Read as the preview site shows them, where every page is live,
 * so the check needs no publish gate.
 */

/** Every docs link a file lists, by its product: `viewer`, `headless`, `engine`. */
function linksOf(body: string, product: string): string[] {
  return [...body.matchAll(/\]\((https:\/\/www\.embedpdf\.com\/docs\/[^)]+)\)/g)]
    .map((match) => match[1])
    .filter((url) => url.split('/')[4] === product);
}

describe('the llms files', () => {
  beforeEach(() => vi.stubEnv('DOCS_PREVIEW', '1'));
  afterEach(() => vi.unstubAllEnvs());

  it('lists each page once in /llms.txt, in its product’s default integration', () => {
    const body = renderLlms(null);

    expect(body.startsWith('# EmbedPDF\n')).toBe(true);
    expect(linksOf(body, 'viewer').length).toBeGreaterThan(0);
    for (const url of linksOf(body, 'viewer')) expect(url).toContain('/docs/viewer/vanilla');
    for (const url of linksOf(body, 'headless')) expect(url).toContain('/docs/headless/react');
    expect(new Set(linksOf(body, 'viewer')).size).toBe(linksOf(body, 'viewer').length);
  });

  it('lists a product’s pages in the order its sidebar has them', () => {
    const headless = linksOf(renderLlms(null), 'headless').map((url) =>
      url.replace('https://www.embedpdf.com/docs/headless/react', '').replace(/\.md$/, ''),
    );

    // The overview, the quick start and setup lead; then each group, in its own order.
    expect(headless.slice(0, 4)).toEqual(['', '/quick-start', '/setup', '/viewing/stage']);
    expect(headless.indexOf('/viewing/stage')).toBeLessThan(headless.indexOf('/documents/opening'));
    expect(headless.indexOf('/annotations')).toBeLessThan(headless.indexOf('/annotations/tools'));
    expect(headless.indexOf('/annotations/tools')).toBeLessThan(
      headless.indexOf('/annotations/comments'),
    );
    expect(headless.at(-1)).toBe('/errors');
  });

  it('links every integration’s file from /llms.txt, before the pages', () => {
    const body = renderLlms(null);
    const files = DOCS_INTEGRATIONS.map(
      (integration) => `https://www.embedpdf.com/llms/${integration}.txt`,
    );

    for (const file of files) expect(body).toContain(`(${file})`);
    expect(body.indexOf('## By framework')).toBeLessThan(body.indexOf('## Ready-made Viewer'));
    expect(body).toContain('This file lists the viewer pages for Vanilla JS');
  });

  it('lists every page for one framework in its file, and no other framework’s', () => {
    const body = renderLlms('vue');

    expect(body.startsWith('# EmbedPDF for Vue\n')).toBe(true);
    for (const url of linksOf(body, 'viewer')) expect(url).toContain('/docs/viewer/vue');
    for (const url of linksOf(body, 'headless')) expect(url).toContain('/docs/headless/vue');
    expect(linksOf(body, 'viewer').length).toBe(linksOf(renderLlms(null), 'viewer').length);
    expect(linksOf(body, 'headless').length).toBe(linksOf(renderLlms(null), 'headless').length);
    expect(linksOf(body, 'engine')).toEqual(linksOf(renderLlms(null), 'engine'));
    for (const url of [...body.matchAll(/\]\(([^)]+)\)/g)]) expect(url[1]).toMatch(/\.(md|txt)$/);
  });

  it('links the other frameworks’ files from a framework’s file, not its own', () => {
    const body = renderLlms('vue');

    expect(body).toContain('## Other frameworks');
    expect(body).not.toContain('## By framework');
    expect(body).toContain('(https://www.embedpdf.com/llms/react.txt)');
    expect(body).not.toContain('(https://www.embedpdf.com/llms/vue.txt)');
  });

  it('leaves the headless pages out of the Vanilla JS file', () => {
    const body = renderLlms('vanilla');

    expect(body).not.toContain('## Headless Components');
    expect(linksOf(body, 'headless')).toEqual([]);
    expect(linksOf(body, 'viewer').length).toBeGreaterThan(0);
    expect(body).toContain('The headless components need React, Vue, Svelte or Angular.');
  });
});

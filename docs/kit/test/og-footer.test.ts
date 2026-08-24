import { describe, expect, it } from 'vitest';

import { elideRoute } from '../src/og/card';

const ORIGIN = 'cloudpdf.com';
const WITH_PANEL = 56;
const BARE = 88;

describe('elideRoute', () => {
  it('leaves a route that already clears the panel', () => {
    const route = '/docs/api-reference/authentication';
    expect(elideRoute(ORIGIN, route, WITH_PANEL)).toBe(route);
  });

  /**
   * The case this exists for: the API reference nests four segments deep, and
   * the panel's rotated backing layers reach into the footer line at x=753.
   * Before this, `…/annotations/create` ran straight into them.
   */
  it('elides the middle of a route that would reach the panel', () => {
    const elided = elideRoute(
      ORIGIN,
      '/docs/api-reference/document-operations/annotations/create',
      WITH_PANEL,
    );
    expect(elided).toBe('/docs/api-reference/…/annotations/create');
    expect(ORIGIN.length + elided.length).toBeLessThanOrEqual(WITH_PANEL);
  });

  /**
   * A fixed-size tail got this backwards: it dropped `engine` — the product —
   * to keep `core-concepts`, a structural bucket.
   */
  it('keeps the head segment over a middle bucket when both would fit', () => {
    expect(
      elideRoute('embedpdf.com', '/docs/engine/core-concepts/engine-and-handles', WITH_PANEL),
    ).toBe('/docs/engine/…/engine-and-handles');
    expect(elideRoute(ORIGIN, '/docs/api-reference/document-operations/download', WITH_PANEL)).toBe(
      '/docs/api-reference/…/download',
    );
  });

  it('keeps the resource beside the leaf when there is room for both', () => {
    expect(
      elideRoute(ORIGIN, '/docs/api-reference/document-operations/forms/set-value', WITH_PANEL),
    ).toBe('/docs/api-reference/…/forms/set-value');
  });

  it('keeps the domain and the leaf — the halves that identify the page', () => {
    const route = '/docs/platform/deployment/regions/europe/west/some-very-long-leaf';
    const elided = elideRoute(ORIGIN, route, WITH_PANEL);
    expect(elided.startsWith('/docs/')).toBe(true);
    expect(elided.endsWith('/some-very-long-leaf')).toBe(true);
    expect(elided).toContain('…');
  });

  it('gives a bare card the wider budget, so most routes stay whole', () => {
    const route = '/docs/api-reference/document-operations/annotations/create';
    expect(elideRoute(ORIGIN, route, BARE)).toBe(route);
  });

  it('falls back to the leaf alone when nothing else fits', () => {
    const elided = elideRoute(ORIGIN, '/averyveryverylongsinglesegmentthatwillnotfitatall', 20);
    expect(elided).toBe('/…/averyveryverylongsinglesegmentthatwillnotfitatall');
  });

  it('never returns a route longer than the one it was given', () => {
    for (const route of ['/docs', '/docs/engine/core-concepts/text', '/docs/a/b/c/d/e']) {
      expect(elideRoute(ORIGIN, route, WITH_PANEL).length).toBeLessThanOrEqual(route.length);
    }
  });
});

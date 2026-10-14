import { afterEach, describe, expect, it, vi } from 'vitest';

import { openExternalUri } from '../src/external-uri';
import { isModifiedClick, linkAnchorOf, linkHrefOf, navigableLinksOf } from '../src/link-anchor';

const website = { target: { kind: 'uri', uri: 'https://example.com' }, attached: false };

afterEach(() => vi.unstubAllGlobals());

describe('link anchors', () => {
  it('gives a website its href, never a blocked scheme, a page target or a chain', () => {
    expect(linkHrefOf(website)).toBe('https://example.com');
    expect(
      linkHrefOf({ ...website, target: { kind: 'uri', uri: 'javascript:alert(1)' } }),
    ).toBeNull();
    expect(linkHrefOf({ ...website, target: { kind: 'goto' } })).toBeNull();
    expect(linkHrefOf({ ...website, activate: { root: { next: [{}] } } })).toBeNull();
    expect(linkHrefOf({ ...website, activate: { root: { next: [] } } })).toBe(
      'https://example.com',
    );
  });

  it('stands an attached link down while annotations are edited', () => {
    const attached = { ...website, attached: true };
    expect(navigableLinksOf([website, attached], true)).toEqual([website]);
    expect(navigableLinksOf([website, attached], false)).toEqual([website, attached]);
  });

  it('places an anchor at the link’s bounds, with its href and label', () => {
    // A page drawn at 2 px per point, shifted by (10, 20).
    const page = {
      toPixels: (point: { x: number; y: number }) => ({ x: point.x * 2 + 10, y: point.y * 2 + 20 }),
    };
    const link = { ...website, bounds: { x: 1, y: 2, width: 3, height: 4 } };
    expect(linkAnchorOf(link, page, (each) => `Open ${each.target.uri}`)).toEqual({
      link,
      box: { left: 12, top: 24, width: 6, height: 8 },
      href: 'https://example.com',
      label: 'Open https://example.com',
    });
  });

  it('leaves a click with a modifier key to the browser', () => {
    const plain = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
    expect(isModifiedClick(plain)).toBe(false);
    expect(isModifiedClick({ ...plain, ctrlKey: true })).toBe(true);
  });

  it('opens an allowed address in a new tab and refuses the rest', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    expect(openExternalUri('https://example.com')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    expect(openExternalUri('file:///etc/passwd')).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });
});

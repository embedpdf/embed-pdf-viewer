/**
 * The addresses a PDF's link or URI action may open: the web, mail and phone numbers. Every other
 * scheme, `javascript:` and `file:` above all, opens nothing, from a link's anchor and from the
 * actions plugin's default UI adapter alike.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDefaultActionsUiAdapter } from '../src/actions-ui';
import { openExternalUri, sanitizeExternalUri } from '../src/external-uri';

const OPENS = [
  'http://example.com/a',
  'https://example.com/a',
  'HTTPS://EXAMPLE.COM/a',
  'mailto:someone@example.com',
  'tel:+15551234567',
  '//example.com/scheme-relative',
];

const OPENS_NOTHING = [
  'javascript:alert(1)',
  ' JavaScript:alert(1)',
  'java\tscript:alert(1)',
  'file:///etc/passwd',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'blob:https://example.com/0f2a',
  'intent://scan#Intent;scheme=zxing;end',
  'acrobat:open',
  '',
];

afterEach(() => vi.unstubAllGlobals());

describe('sanitizeExternalUri', () => {
  it('lets http, https, mailto and tel through', () => {
    for (const uri of OPENS) expect(sanitizeExternalUri(uri), uri).not.toBeNull();
  });

  it('refuses every other scheme', () => {
    for (const uri of OPENS_NOTHING) expect(sanitizeExternalUri(uri), uri).toBeNull();
  });
});

describe('opening an address', () => {
  it('opens an allowed one in a new tab, without the page as its opener', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    for (const uri of OPENS) expect(openExternalUri(uri), uri).toBe(true);
    expect(open).toHaveBeenCalledTimes(OPENS.length);
    for (const call of open.mock.calls)
      expect(call.slice(1)).toEqual(['_blank', 'noopener,noreferrer']);
  });

  it('opens nothing for a refused one, from a link or from a URI action', () => {
    const open = vi.fn();
    vi.stubGlobal('window', { open });
    const adapter = createDefaultActionsUiAdapter();
    for (const uri of OPENS_NOTHING) {
      expect(openExternalUri(uri), uri).toBe(false);
      adapter.openUri(uri, { isMap: false, origin: 'user' });
    }
    expect(open).not.toHaveBeenCalled();
  });
});

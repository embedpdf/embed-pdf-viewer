/**
 * The cloud door: importing it makes the cloud engine the default of `<embedpdf-viewer>`, at
 * CloudPDF SaaS unless the config names a server, with documents in the cloud's words and a
 * local engine for stamp libraries. Only the requests' addresses are checked: the stub answers
 * every one with a 404.
 */
import type { OpenInput } from '@cloudpdf/engine';
import { EmbedPdfViewerElement, type DoorEngine } from '@embedpdf/viewer/core';
import { describe, expect, it } from 'vitest';

import { openInputOf } from '../src/config';
import '../src/index';

/** What the door makes of a config's `engine` settings. */
function doorFor(settings?: object): DoorEngine {
  const provide = EmbedPdfViewerElement.defaultEngineProvider;
  if (!provide) throw new Error('the cloud door registered no engine');
  return provide(settings);
}

function recordingFetch() {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(JSON.stringify({ code: 'not_found', message: 'no such share' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { urls, fetch };
}

/** Open `src` through the door's engine, as the element does, and say where it went first. */
async function firstRequestFor(src: object, settings: object): Promise<string | undefined> {
  const { urls, fetch } = recordingFetch();
  const door = doorFor({ ...settings, fetch });
  const engine = typeof door.engine === 'function' ? await door.engine() : door.engine;
  const input = door.sourceOf ? door.sourceOf(src) : src;
  await engine.open(input as OpenInput).catch(() => undefined);
  return urls[0];
}

describe('the cloud door', () => {
  it('opens a grant through the cloud engine, at CloudPDF SaaS by default', async () => {
    expect(await firstRequestFor({ grant: 'grt_1' }, {})).toMatch(
      /^https:\/\/engine\.cloudpdf\.com\/v1\//,
    );
  });

  it('connects to the server its engine settings name', async () => {
    expect(await firstRequestFor({ id: 'doc-1' }, { baseUrl: 'https://pdf.example.com' })).toMatch(
      /^https:\/\/pdf\.example\.com\/v1\/docs\/doc-1\//,
    );
  });

  it('names the cloud documents as the engine opens them, and leaves the rest as they are', () => {
    expect(openInputOf({ token: 't' })).toEqual({ kind: 'token', token: 't' });
    expect(openInputOf({ id: 'doc', token: 't' })).toEqual({ kind: 'id', id: 'doc', token: 't' });
    expect(openInputOf({ grant: 'shr', passphrase: 'pw' })).toEqual({
      kind: 'grant',
      grant: 'shr',
      passphrase: 'pw',
    });
    const input = { kind: 'token', token: 't' } as const;
    expect(openInputOf(input)).toBe(input);
    expect(openInputOf('/report.pdf')).toBe('/report.pdf');
    expect(doorFor().sourceOf).toBe(openInputOf);
  });

  it('gives stamp libraries a local engine, loaded on first use', () => {
    const stamp = doorFor().plugins?.stamp as { assetEngine?: unknown } | undefined;
    expect(typeof stamp?.assetEngine).toBe('function');
  });
});

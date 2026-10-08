import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { docsRelease, isDocsPreview, loadLivePages, type LivePages } from '../src/publish';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-publish-'));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

const LIVE_PAGES: LivePages = {
  pages: {
    'text/search': {
      pending: [],
      live: { react: true, vue: false, svelte: false, angular: false },
    },
    'documents/saving': {
      pending: ['print'],
      live: { react: false, vue: false, svelte: false, angular: false },
    },
    'annotations/index': {
      pending: [],
      live: { react: false, vue: false, svelte: false, angular: true },
    },
    'viewer/customize/layout': {
      pending: [],
      live: { vanilla: false, react: true, vue: false, svelte: false, angular: false },
    },
    'viewer/index': {
      pending: [],
      live: { vanilla: true, react: true, vue: false, svelte: false, angular: false },
    },
    'viewer/features/index': {
      pending: [],
      live: { vanilla: false, react: false, vue: false, svelte: false, angular: false },
    },
  },
};

const release = (contentPath: string, framework: string | undefined, preview = false) =>
  docsRelease({ contentPath, framework, preview, livePages: () => LIVE_PAGES });

describe('the publish gate', () => {
  it('shows a headless page where it is live, and holds it back where it is not', () => {
    expect(release('docs/headless/text/search', 'react')).toEqual({
      live: true,
      preview: false,
      reactLive: true,
    });
    expect(release('docs/headless/text/search', 'vue')).toEqual({
      live: false,
      preview: false,
      reactLive: true,
    });
    expect(release('docs/headless/documents/saving', 'react').live).toBe(false);
  });

  it('finds an index page by its directory', () => {
    expect(release('docs/headless/annotations', 'angular').live).toBe(true);
    expect(release('docs/headless/annotations', 'react')).toMatchObject({
      live: false,
      reactLive: false,
    });
  });

  it('holds back a page the status has not seen yet', () => {
    expect(release('docs/headless/ui/brand-new', 'react')).toMatchObject({
      live: false,
      reactLive: false,
    });
  });

  it('shows a viewer page where it is live, plain HTML included, and holds it back where it is not', () => {
    expect(release('docs/viewer/customize/layout', 'react')).toEqual({
      live: true,
      preview: false,
      reactLive: true,
    });
    expect(release('docs/viewer/customize/layout', 'vanilla')).toEqual({
      live: false,
      preview: false,
      reactLive: true,
    });
    expect(release('docs/viewer', 'vanilla').live).toBe(true);
    expect(release('docs/viewer/features', 'vue')).toMatchObject({ live: false, reactLive: false });
  });

  it('never takes a viewer page for the headless page of the same name', () => {
    expect(release('docs/viewer/index', 'angular').live).toBe(false);
    expect(release('docs/headless/annotations/index', 'angular').live).toBe(true);
  });

  it('gates only the headless and viewer docs, and never reads the status for other pages', () => {
    const unread = () => {
      throw new Error('read');
    };
    expect(
      docsRelease({
        contentPath: 'docs/engine/fonts',
        framework: undefined,
        preview: false,
        livePages: unread,
      }).live,
    ).toBe(true);
    expect(
      docsRelease({
        contentPath: 'docs/engine/fonts',
        framework: 'react',
        preview: false,
        livePages: unread,
      }),
    ).toEqual({ live: true, preview: false, reactLive: true });
  });

  it('shows every headless page on the preview site, with the banner only where production holds it back', () => {
    const livePages = () => ({
      pages: {
        'text/search': { pending: [], live: { react: true, vue: false, svelte: false, angular: false } },
      },
    });
    const release = (framework: string) =>
      docsRelease({ contentPath: 'docs/headless/text/search', framework, preview: true, livePages });
    expect(release('react')).toEqual({ live: true, preview: false, reactLive: true });
    expect(release('vue')).toEqual({ live: true, preview: true, reactLive: true });
  });

  it('shows no banner on the preview site before `docs:check` has run', () => {
    const unread = () => {
      throw new Error('missing');
    };
    expect(
      docsRelease({
        contentPath: 'docs/headless/documents/saving',
        framework: 'svelte',
        preview: true,
        livePages: unread,
      }),
    ).toEqual({ live: true, preview: false, reactLive: true });
  });
});

describe('the preview site', () => {
  it('is DOCS_PREVIEW=1, and `next dev` unless DOCS_PREVIEW=0', () => {
    expect(isDocsPreview({ DOCS_PREVIEW: '1', NODE_ENV: 'production' })).toBe(true);
    expect(isDocsPreview({ NODE_ENV: 'production' })).toBe(false);
    expect(isDocsPreview({ NODE_ENV: 'development' })).toBe(true);
    expect(isDocsPreview({ DOCS_PREVIEW: '0', NODE_ENV: 'development' })).toBe(false);
    expect(isDocsPreview({ NODE_ENV: 'test' })).toBe(false);
  });
});

describe('live-pages.json', () => {
  it('says to run docs:check when it is missing', () => {
    expect(() => loadLivePages(path.join(scratch, 'missing.json'))).toThrow(/docs:check/);
  });

  it('reads the file again once docs:check rewrites it', () => {
    const file = path.join(scratch, 'live-pages.json');
    fs.writeFileSync(file, JSON.stringify(LIVE_PAGES));
    expect(loadLivePages(file).pages['text/search'].live.vue).toBe(false);

    const next: LivePages = {
      pages: {
        'text/search': {
          pending: [],
          live: { react: true, vue: true, svelte: false, angular: false },
        },
      },
    };
    fs.writeFileSync(file, JSON.stringify(next));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5_000));
    expect(loadLivePages(file).pages['text/search'].live.vue).toBe(true);
  });
});

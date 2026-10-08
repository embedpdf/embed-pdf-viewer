/**
 * What fails the docs gate in CI (`publish-gate.mjs --strict`).
 *
 *   node --test docs/content/scripts/*.test.mjs
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strictProblems, viewerPendingByPage } from './publish-gate.mjs';
import { VIEWER_PENDING } from '../viewer-pending.mjs';

const fails = (snippet) => ({
  compiles: false,
  errorCount: 1,
  errors: [{ snippet, file: `${snippet}.react.tsx`, line: 3, message: 'Cannot find name' }],
});

const status = ({ headless = {}, viewer = {}, tools = {} } = {}) => ({
  frameworks: { react: { tool: 'tsc' }, vue: { tool: 'vue-tsc' }, ...tools },
  pages: headless,
  viewer: { frameworks: { vanilla: { tool: 'tsc' }, react: { tool: 'tsc' } }, pages: viewer },
});

describe('the docs gate in CI', () => {
  it('passes while every headless page compiles, whatever the viewer pages do', () => {
    const viewer = {
      'viewer/setup': { vanilla: fails('viewer/setup'), react: fails('viewer/setup') },
    };
    const headless = { 'text/search': { react: { compiles: true }, vue: { compiles: true } } };
    assert.deepEqual(strictProblems(status({ headless, viewer })), []);
  });

  it('fails on a headless page that stops compiling, and says where', () => {
    const headless = {
      'text/search': { react: fails('text/search-box'), vue: { compiles: true } },
    };
    const [problem, ...rest] = strictProblems(status({ headless }));
    assert.deepEqual(rest, []);
    assert.match(problem, /^headless\/text\/search\.mdx doesn't compile for React/);
    assert.match(problem, /text\/search-box\.react\.tsx:3: Cannot find name/);
  });

  it('fails on a check that isn’t checking, once, not on every page it compiles', () => {
    const headless = {
      'text/search': { react: { compiles: true }, vue: fails('text/search-box') },
    };
    const tools = { vue: { tool: null, reason: 'vue-tsc missed the canary' } };
    assert.deepEqual(strictProblems(status({ headless, tools })), [
      "the headless Vue check isn't checking: vue-tsc missed the canary",
    ]);
  });
});

describe('what holds a viewer page back', () => {
  const pages = { 'viewer/setup': {}, 'viewer/customize/layout': {} };

  it('reads the rows each page lists', () => {
    const pending = viewerPendingByPage(pages, { setup: { P4: 'src follows its prop' } });
    assert.deepEqual([...pending.get('viewer/setup')], ['P4']);
    assert.equal(pending.has('viewer/customize/layout'), false);
  });

  it('fails on a page that does not exist, and on a row without a reason', () => {
    assert.throws(() => viewerPendingByPage(pages, { setpu: { P4: 'why' } }), /viewer\/setpu\.mdx/);
    assert.throws(() => viewerPendingByPage(pages, { setup: { P4: '' } }), /needs a gap id/);
    assert.throws(
      () => viewerPendingByPage(pages, { setup: { 'not a row': 'why' } }),
      /needs a gap id/,
    );
  });

  it('names only rows with a reason in the manifest itself', () => {
    for (const rows of Object.values(VIEWER_PENDING)) {
      for (const [row, why] of Object.entries(rows)) {
        assert.match(row, /^[A-Z]+\d+$/);
        assert.ok(why.trim().length > 0);
      }
    }
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import {
  loadSearchArtifact,
  writeSearchArtifact,
  SEARCH_ARTIFACT_VERSION,
  type SearchArtifactMeta,
  type SearchArtifactSection,
} from '../src/search/artifact';
import { makeExcerpt } from '../src/search/excerpt';
import { prepareLexical, rankLexical } from '../src/search/lexical';
import { loadSearchIndex, searchIndex } from '../src/search/query';
import { HIGHLIGHT_CLOSE, HIGHLIGHT_OPEN } from '../src/search/types';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-search-'));
afterAll(() => fs.rmSync(scratch, { recursive: true, force: true }));

function section(overrides: Partial<SearchArtifactSection>): SearchArtifactSection {
  return {
    contentPath: 'docs/engine/index',
    anchor: 'anchor',
    pageTitle: 'Engine',
    pageDescription: null,
    sectionTitle: 'Section',
    breadcrumb: ['Engine'],
    product: 'engine',
    depth: 2,
    ordinal: 0,
    prose: '',
    variantProse: {},
    symbols: {},
    id: 'docs/engine/index#anchor',
    hash: 'hash',
    symbolsText: '',
    variantProseText: '',
    vectorRow: -1,
    ...overrides,
  };
}

function writeIndex(
  file: string,
  sections: SearchArtifactSection[],
  vectors: number[][],
  model: string | null = vectors.length > 0 ? 'test-model' : null,
) {
  const dimensions = 4;
  const matrix = new Float32Array(vectors.length * dimensions);
  vectors.forEach((row, index) => {
    const norm = Math.sqrt(row.reduce((sum, value) => sum + value * value, 0)) || 1;
    matrix.set(
      row.map((value) => value / norm),
      index * dimensions,
    );
  });
  const meta: SearchArtifactMeta = {
    version: SEARCH_ARTIFACT_VERSION,
    model,
    dimensions,
    vectorCount: vectors.length,
    builtAt: '2026-01-01T00:00:00.000Z',
    revision: 'test',
    sections,
  };
  writeSearchArtifact(file, meta, matrix);
  return file;
}

describe('artifact format', () => {
  it('round-trips metadata and vectors byte-exactly', () => {
    const file = path.join(scratch, 'roundtrip.bin');
    writeIndex(
      file,
      [section({ prose: 'Hello world', vectorRow: 0 })],
      [[1, 2, 3, 4]],
    );

    const { meta, vectors } = loadSearchArtifact(file);
    expect(meta.sections).toHaveLength(1);
    expect(meta.sections[0].prose).toBe('Hello world');
    expect(meta.vectorCount).toBe(1);
    // Row was L2-normalized on the way in.
    const norm = Math.sqrt([...vectors].reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('refuses a different format version instead of misreading it', () => {
    const file = path.join(scratch, 'bad-version.bin');
    writeIndex(file, [section({ prose: 'x' })], []);
    const bytes = fs.readFileSync(file);
    bytes.writeUInt32LE(99, 4);
    fs.writeFileSync(file, bytes);

    expect(() => loadSearchArtifact(file)).toThrow(/format v99/);
  });
});

describe('lexical channel', () => {
  const sections = [
    section({ id: 'a', anchor: 'a', sectionTitle: 'Zoom', symbolsText: 'useZoom zoomTo', prose: 'Control the scale.' }),
    section({ id: 'b', anchor: 'b', sectionTitle: 'Scrollbar', prose: 'The zoom level also affects scrollbars.' }),
    section({ id: 'c', anchor: 'c', sectionTitle: 'Printing', prose: 'Nothing relevant here.' }),
  ];
  const prepared = prepareLexical(sections);

  it('AND-matches prefixes and weighs identifier hits above prose hits', () => {
    const ranked = rankLexical(prepared, ['zoom'], [0, 1, 2], 50);
    expect(ranked.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it('drops sections that miss any term', () => {
    const ranked = rankLexical(prepared, ['zoom', 'scrollbar'], [0, 1, 2], 50);
    expect(ranked.map((entry) => entry.index)).toEqual([1]);
  });
});

describe('excerpts', () => {
  it('windows around the first match and wraps every matched word', () => {
    const prose = `${'Filler word '.repeat(30)}the zoom plugin scales pages smoothly and zooming stays crisp.`;
    const excerpt = makeExcerpt(prose, ['zoom']);

    expect(excerpt).toContain(`${HIGHLIGHT_OPEN}zoom${HIGHLIGHT_CLOSE}`);
    expect(excerpt).toContain(`${HIGHLIGHT_OPEN}zooming${HIGHLIGHT_CLOSE}`);
    expect(excerpt.startsWith('… ')).toBe(true);
  });

  it('falls back to the lede when no term appears in prose', () => {
    const excerpt = makeExcerpt('A quiet paragraph about nothing in particular.', ['zoom']);
    expect(excerpt).toBe('A quiet paragraph about nothing in particular.');
    expect(excerpt).not.toContain(HIGHLIGHT_OPEN);
  });
});

describe('fused search', () => {
  const sections = [
    section({
      id: 'lex',
      anchor: 'lex',
      contentPath: 'docs/engine/lexical',
      sectionTitle: 'Zoom controls',
      prose: 'Zoom in and out.',
      vectorRow: 0,
    }),
    section({
      id: 'sem',
      anchor: 'sem',
      contentPath: 'docs/engine/semantic',
      sectionTitle: 'Scaling pages',
      prose: 'Make pages larger or smaller.',
      vectorRow: 1,
    }),
    section({
      id: 'other',
      anchor: 'other',
      contentPath: 'docs/viewer/other',
      product: 'viewer',
      sectionTitle: 'Toolbar',
      prose: 'Buttons and menus.',
      vectorRow: 2,
    }),
  ];
  // "zoom"-like query vector is near section `sem`'s vector.
  const vectors = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
  ];
  const file = writeIndex(path.join(scratch, 'fused.bin'), sections, vectors);
  const urlForSection = (contentPath: string, anchor: string | null) =>
    anchor ? `/${contentPath}#${anchor}` : `/${contentPath}`;

  it('fuses both retrievers: a semantic-only hit surfaces without a lexical match', async () => {
    const index = loadSearchIndex(file);
    const response = await searchIndex(index, {
      query: 'zoom',
      urlForSection,
      embedQuery: async () => [0, 1, 0, 0],
    });

    expect(response.degraded).toBe(false);
    const byId = Object.fromEntries(response.hits.map((hit) => [hit.anchor, hit.matchedBy]));
    expect(byId.lex).toContain('lexical');
    expect(byId.sem).toEqual(['semantic']);
    expect(response.hits[0].url).toMatch(/^\/docs\//);
  });

  it('degrades to lexical-only when the embedder returns nothing', async () => {
    const index = loadSearchIndex(file);
    const response = await searchIndex(index, {
      query: 'zoom',
      urlForSection,
      embedQuery: async () => null,
    });

    expect(response.degraded).toBe(true);
    expect(response.hits.map((hit) => hit.anchor)).toEqual(['lex']);
  });

  it('filters by product before either retriever runs', async () => {
    const index = loadSearchIndex(file);
    const response = await searchIndex(index, {
      query: 'toolbar',
      product: 'engine',
      urlForSection,
      embedQuery: async () => null,
    });

    expect(response.hits).toEqual([]);
  });

  it('reports a lexical-only artifact as degraded without calling the embedder', async () => {
    const lexFile = writeIndex(
      path.join(scratch, 'lexical-only.bin'),
      [section({ id: 'only', anchor: 'only', prose: 'Zoom things.' })],
      [],
      null,
    );
    const index = loadSearchIndex(lexFile);
    let called = false;
    const response = await searchIndex(index, {
      query: 'zoom',
      urlForSection,
      embedQuery: async () => {
        called = true;
        return [1, 0, 0, 0];
      },
    });

    expect(called).toBe(false);
    expect(response.degraded).toBe(true);
    expect(response.hits).toHaveLength(1);
  });
});

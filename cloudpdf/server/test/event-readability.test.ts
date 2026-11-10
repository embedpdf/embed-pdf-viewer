/**
 * Whether one event-stream connection can read an audit row: the kinds of
 * row and of change item its version has. A row it can't read goes out as
 * `full-refresh`.
 */
import { API_VERSION, parseApiVersion } from '@embedpdf/engine-core/wire';
import { describe, expect, it } from 'vitest';

import { unreadableBy } from '../src/services/eventReadability';
import type { StreamRow } from '../src/services/eventVisibility';

const own = parseApiVersion(API_VERSION)!;
const NEWER = `${own.major}.${own.minor + 1}`;

const row = (kind: string, payload: Record<string, unknown> = {}): StreamRow => ({
  id: 7,
  kind,
  sub: 'alice',
  payload,
});
const change = (...types: string[]): StreamRow =>
  row('change', { items: types.map((type) => ({ type })) });

describe('unreadableBy', () => {
  it('a client reads the change kinds that arrived by its version', () => {
    expect(unreadableBy('3.0', change('pages.rotate', 'annotations.create'))).toBe(false);
    expect(unreadableBy('3.0', change('pages.rotate', 'pages.setScale'))).toBe(true);
    expect(unreadableBy('3.1', change('pages.setScale'))).toBe(false);
  });

  it('a client of this version, a newer one, and one that sent no version read every kind', () => {
    for (const version of [API_VERSION, NEWER, null]) {
      expect(unreadableBy(version, change('pages.setScale')), String(version)).toBe(false);
    }
  });

  it('what an undo left alone counts as the kind it would have been', () => {
    const skipped = row('change', { items: [{ type: 'skipped', op: 'pages.setScale' }] });
    expect(unreadableBy('3.0', skipped)).toBe(true);
    expect(unreadableBy('3.1', skipped)).toBe(false);
  });

  it('a kind this server does not have is read only by a newer client', () => {
    for (const unknown of [change('future.thing'), row('future.row')]) {
      expect(unreadableBy('3.0', unknown)).toBe(true);
      expect(unreadableBy(API_VERSION, unknown)).toBe(true);
      expect(unreadableBy(null, unknown)).toBe(true);
      expect(unreadableBy(NEWER, unknown)).toBe(false);
    }
    // A name every object has is no kind of row.
    expect(unreadableBy(API_VERSION, row('constructor'))).toBe(true);
  });

  it('every other kind of row is as old as 3.0, and a withheld row is only its pins', () => {
    expect(unreadableBy('3.0', row('annot.create', { annotation: {} }))).toBe(false);
    expect(unreadableBy('3.0', row('signature.complete'))).toBe(false);
    const withheld = { ...change('pages.setScale'), withheld: true };
    expect(unreadableBy('3.0', withheld)).toBe(false);
  });
});

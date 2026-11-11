/**
 * A row this engine version can't read (a kind of row, or of change item,
 * that a newer server has) reads as `null`: nothing says what it changed, so
 * the document is read again. A row it can read stays a list of events.
 */
import { describe, expect, test } from 'vitest';

import { auditRowToEvents, type AuditEventRow } from '../src/realtime/auditRowToEvents';

const meta = { affectedPages: [], cacheDelta: null, opId: 'op-1', undoable: true };
const row = (
  kind: string,
  payload: unknown,
  extra: Partial<AuditEventRow> = {},
): AuditEventRow => ({
  id: 12,
  ts: 1,
  sub: 'alice',
  kind,
  pageObjectNumber: null,
  affectedPages: [],
  originSessionId: 'someone-else',
  payload,
  ...extra,
});
const change = (...items: Record<string, unknown>[]) => row('change', { items, meta });

describe('a row this version can not read', () => {
  test('a change with an item of a kind it lacks, and a row of a kind it lacks', () => {
    expect(auditRowToEvents(change({ type: 'future.thing', meta }), 'me')).toBeNull();
    expect(auditRowToEvents(row('future.row', { meta }), 'me')).toBeNull();
  });

  test('one unreadable item makes the whole row unreadable', () => {
    const rotated = {
      type: 'pages.rotate',
      pages: [],
      rotation: 90,
      layout: { pageCount: 0, pages: [], labels: [], namedPages: [] },
      meta,
    };
    expect(auditRowToEvents(change(rotated), 'me')!.map((event) => event.type)).toEqual([
      'pages.rotated',
    ]);
    expect(auditRowToEvents(change(rotated, { type: 'future.thing', meta }), 'me')).toBeNull();
  });

  test('its own echo, pins only, and what an undo left alone are no events, not a desync', () => {
    const unknown = change({ type: 'future.thing', meta });
    expect(auditRowToEvents({ ...unknown, originSessionId: 'me' }, 'me')).toEqual([]);
    const withheld = row('future.row', { meta: { cacheDelta: null } }, { withheld: true });
    expect(auditRowToEvents(withheld, 'me')).toEqual([]);
    expect(auditRowToEvents(change({ type: 'skipped', op: 'future.thing', meta }), 'me')).toEqual(
      [],
    );
  });

  test('a row it knows with nothing to tell is no events', () => {
    // A scale written before a scale carried the layout.
    expect(auditRowToEvents(row('measure.setScale', { meta }), 'me')).toEqual([]);
  });
});

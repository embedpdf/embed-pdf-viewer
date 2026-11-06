/**
 * A row the server withheld from this connection (it holds nothing the token
 * may read) carries only its pins: it becomes no event, whatever its kind,
 * but `fonts.changed` when its pins moved the font list's.
 */
import { describe, expect, test } from 'vitest';

import { auditRowToEvents, type AuditEventRow } from '../src/realtime/auditRowToEvents';

const withheld = (kind: string, cacheDelta: Record<string, unknown>): AuditEventRow => ({
  id: 12,
  ts: 1,
  sub: 'alice',
  kind,
  pageObjectNumber: 3,
  affectedPages: [3],
  originSessionId: 'someone-else',
  withheld: true,
  payload: {
    meta: { cacheDelta: { previousDocVersion: 1, docVersion: 2, pages: [], ...cacheDelta } },
  },
});

describe('withheld rows', () => {
  test('become no event', () => {
    for (const kind of ['annot.create', 'form.setValue', 'change']) {
      expect(auditRowToEvents(withheld(kind, {}), 'me')).toEqual([]);
    }
  });

  test('that moved the font list become fonts.changed', () => {
    for (const kind of ['annot.create', 'form.setValue', 'change']) {
      const events = auditRowToEvents(withheld(kind, { fontsVersion: 2 }), 'me');
      expect(events.map((event) => event.type)).toEqual(['fonts.changed']);
      expect(events[0].origin).toMatchObject({ kind: 'remote', serverSequence: 12 });
    }
  });
});

/**
 * A row the server withheld from this connection (it holds nothing the token
 * may read) carries only its pins: it becomes no event, whatever its kind.
 */
import { describe, expect, test } from 'vitest';

import { auditRowToEvents } from '../src/realtime/auditRowToEvents';

describe('withheld rows', () => {
  test('become no event', () => {
    for (const kind of ['annot.create', 'form.setValue', 'change']) {
      expect(
        auditRowToEvents(
          {
            id: 12,
            ts: 1,
            sub: 'alice',
            kind,
            pageObjectNumber: 3,
            affectedPages: [3],
            originSessionId: 'someone-else',
            withheld: true,
            payload: { meta: { cacheDelta: { previousDocVersion: 1, docVersion: 2, pages: [] } } },
          },
          'me',
        ),
      ).toEqual([]);
    }
  });
});

/** When an answer applies: every row of the rule, for an answer with a window and one without an end. */
import { describe, expect, test } from 'vitest';

import type { RevocationAnswerCheck } from '../../src/revocation/answer';
import { revocationStatusAt } from '../../src/revocation/status';

const at = (iso: string) => new Date(iso);
const SIGNED = at('2026-11-14T21:28:37Z');

const good = (thisUpdate: string, nextUpdate: string | null): RevocationAnswerCheck => ({
  says: 'good',
  kind: 'ocsp',
  thisUpdate: at(thisUpdate),
  nextUpdate: nextUpdate ? at(nextUpdate) : null,
  responder: null,
});
const revoked = (revokedAt: string): RevocationAnswerCheck => ({
  says: 'revoked',
  revokedAt: at(revokedAt),
  reason: 'key-compromise',
  kind: 'crl',
  thisUpdate: at('2027-01-01T00:00:00Z'),
  nextUpdate: at('2027-01-08T00:00:00Z'),
  responder: null,
});
const nothing: RevocationAnswerCheck = {
  says: 'nothing',
  kind: 'ocsp',
  problem: 'signature',
  detail: 'does not verify',
};

describe('revocationStatusAt', () => {
  test('withdrawn at or before the moment: revoked', () => {
    expect(revocationStatusAt([revoked('2026-11-14T21:28:37Z')], SIGNED).status).toBe('revoked');
    expect(revocationStatusAt([revoked('2026-11-01T00:00:00Z')], SIGNED).status).toBe('revoked');
  });

  test('withdrawn after the moment: good, it had not been withdrawn yet', () => {
    const answer = revoked('2026-12-01T00:00:00Z');
    expect(revocationStatusAt([answer], SIGNED)).toEqual({ status: 'good', answer });
  });

  test('good, in an answer made at or after the moment', () => {
    // Fetched a minute after signing, and still an answer about the signing years later.
    const answer = good('2026-11-14T21:29:30Z', '2026-11-14T21:39:30Z');
    expect(revocationStatusAt([answer], SIGNED).status).toBe('good');
  });

  test('good, in an answer whose window contains the moment', () => {
    // A list issued three days before, valid for a week.
    const answer = good('2026-11-11T00:00:00Z', '2026-11-18T00:00:00Z');
    expect(revocationStatusAt([answer], SIGNED).status).toBe('good');
    expect(revocationStatusAt([answer], at('2026-11-18T00:00:00Z')).status).toBe('good');
  });

  test('good, but its window ended before the moment: it says nothing', () => {
    const answer = good('2026-11-01T00:00:00Z', '2026-11-08T00:00:00Z');
    expect(revocationStatusAt([answer], SIGNED)).toEqual({ status: 'unknown', answer: null });
    // The stored answer from signing day says nothing about a year later.
    const stored = good('2026-11-14T21:29:30Z', '2026-11-14T21:39:30Z');
    expect(revocationStatusAt([stored], at('2027-11-14T00:00:00Z')).status).toBe('unknown');
  });

  test('an answer with no end to its window speaks for a few minutes', () => {
    const answer = good('2026-11-14T21:27:00Z', null);
    expect(revocationStatusAt([answer], SIGNED).status).toBe('good');
    expect(revocationStatusAt([answer], at('2026-11-14T21:40:00Z')).status).toBe('unknown');
  });

  test('a withdrawal that applies wins over any answer that says good', () => {
    const answers = [
      good('2026-11-14T21:29:30Z', '2026-11-14T21:39:30Z'),
      revoked('2026-11-10T00:00:00Z'),
      revoked('2026-11-05T00:00:00Z'),
    ];
    const status = revocationStatusAt(answers, SIGNED);
    expect(status.status).toBe('revoked');
    // The earliest withdrawal is the one named.
    expect(status.answer).toBe(answers[2]);
  });

  test('answers that say nothing leave it unknown', () => {
    expect(revocationStatusAt([nothing], SIGNED).status).toBe('unknown');
    expect(revocationStatusAt([], SIGNED).status).toBe('unknown');
  });
});

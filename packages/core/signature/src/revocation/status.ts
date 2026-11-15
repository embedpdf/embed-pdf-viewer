/**
 * When a revocation answer applies. An answer is a statement about a moment: a certificate
 * that was good last year may have been withdrawn since, and one withdrawn today was still
 * good when it signed last year.
 */
import type { RevocationAnswerCheck } from './answer';

/**
 * How long an OCSP answer that names no end to its window is taken to speak for. A responder
 * leaves `nextUpdate` out when it always has newer information, so such an answer says little
 * beyond the moment it was made; without a little room, an answer fetched a second ago would
 * say nothing about now.
 */
const OPEN_WINDOW_MS = 5 * 60 * 1000;

export interface RevocationStatus {
  /** `unknown`: no answer speaks for that moment. Never a reason to call a certificate good or bad. */
  status: 'good' | 'revoked' | 'unknown';
  /** The answer that decided it; null for `unknown`. */
  answer: RevocationAnswerCheck | null;
}

/**
 * What the checked answers about one certificate say at `at`:
 *
 * - withdrawn at or before `at`: `revoked`, and nothing overrides it;
 * - withdrawn after `at`: `good`, it had not been withdrawn yet;
 * - good, in an answer made at or after `at`: `good`, a withdrawn certificate stays withdrawn;
 * - good, in an answer whose window contains `at`: `good`;
 * - otherwise `unknown`.
 */
export function revocationStatusAt(
  checks: readonly RevocationAnswerCheck[],
  at: Date,
): RevocationStatus {
  const time = at.getTime();
  let good: RevocationAnswerCheck | null = null;
  let revoked: (RevocationAnswerCheck & { says: 'revoked' }) | null = null;
  for (const check of checks) {
    if (check.says === 'nothing') continue;
    if (check.says === 'revoked') {
      if (check.revokedAt.getTime() <= time) {
        if (!revoked || check.revokedAt < revoked.revokedAt) revoked = check;
      } else {
        good ??= check;
      }
      continue;
    }
    const from = check.thisUpdate.getTime();
    const until = check.nextUpdate ? check.nextUpdate.getTime() : from + OPEN_WINDOW_MS;
    if (from >= time || time <= until) good ??= check;
  }
  if (revoked) return { status: 'revoked', answer: revoked };
  return good ? { status: 'good', answer: good } : { status: 'unknown', answer: null };
}

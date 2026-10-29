import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * Who a grant's visitor is. A grant can ask its visitors (the grant's
 * `visitorIdentity`): when they open it, or before their first change. Their
 * answers are given once and go into every session token issued for them, as
 * the identity the server stamps on what they add.
 */

/** A field a grant can ask, as a session's identity names it. */
export type VisitorIdentityField =
  | 'displayName'
  | 'email'
  | 'title'
  | 'organization'
  | 'organizationalUnit';

/** A visitor's answers to what a grant asks. */
export type VisitorAnswers = Partial<Record<VisitorIdentityField, string>>;

/** What a grant still asks a visitor: the details of `VisitorIdentityRequired`. */
export interface VisitorIdentityRequest {
  /** What the grant asks, each required or optional. */
  readonly fields: Partial<Record<VisitorIdentityField, 'required' | 'optional'>>;
  /** Required fields not answered yet. */
  readonly missing: readonly VisitorIdentityField[];
  /** Answers given last time that couldn't be taken (an email that isn't one, too long). */
  readonly invalid: readonly VisitorIdentityField[];
  /** Why the grant asks, in its owner's words. */
  readonly purpose?: string;
  /** The grant owner's privacy notice. */
  readonly privacyUrl?: string;
}

/**
 * What a grant waits for before its document opens, or before an open one goes on: the
 * grant's passphrase (`passphraseProvided`: one was tried and was wrong), or the visitor's answers to
 * what it asks on open.
 */
export type GrantOpenRequest =
  | { readonly kind: 'passphrase'; readonly passphraseProvided: boolean }
  | { readonly kind: 'identity'; readonly request: VisitorIdentityRequest };

/**
 * What a grant's refusal waits for: its passphrase (`GrantPassphraseRequired`;
 * `passphraseProvided` says whether one was tried) or the visitor's answers
 * (`VisitorIdentityRequired`); `null` for any other error.
 */
export function grantOpenRequestOf(
  error: unknown,
  passphraseProvided: boolean,
): GrantOpenRequest | null {
  if (EngineError.is(error, EngineErrorCode.GrantPassphraseRequired)) {
    return { kind: 'passphrase', passphraseProvided };
  }
  const request = visitorIdentityRequestOf(error);
  return request ? { kind: 'identity', request } : null;
}

/** The questions a `VisitorIdentityRequired` error asks (its details); `null` for any other error. */
export function visitorIdentityRequestOf(error: unknown): VisitorIdentityRequest | null {
  if (!EngineError.is(error, EngineErrorCode.VisitorIdentityRequired)) return null;
  const request = error.details as Partial<VisitorIdentityRequest> | undefined;
  return request && typeof request.fields === 'object' && Array.isArray(request.missing)
    ? {
        fields: request.fields,
        missing: request.missing,
        invalid: Array.isArray(request.invalid) ? request.invalid : [],
        ...(typeof request.purpose === 'string' ? { purpose: request.purpose } : {}),
        ...(typeof request.privacyUrl === 'string' ? { privacyUrl: request.privacyUrl } : {}),
      }
    : null;
}

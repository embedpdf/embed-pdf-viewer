/**
 * Unified "should I ask the user for a password?" shape.
 *
 * A PDF has two distinct password moments:
 *   1. **Required** — the document is encrypted and we couldn't read
 *      anything anonymously. The dev MUST gather a password and call
 *      `unlock()` before any other operation succeeds.
 *   2. **Optional** — the document is open and readable, but more
 *      permissions become available with the owner password. The dev
 *      MAY surface an "unlock for full access" affordance.
 *
 * Plus the trivial third state: **none** — nothing to do.
 *
 * The discriminated union encodes the invariants:
 *   - `required` and `optional` cannot both be true (a doc you can't
 *     read can't be "upgraded" — you have to read first).
 *   - `hint` is only present when meaningful (no hint in the `none` arm,
 *     mandatory `owner` hint in `optional` since that's the only thing
 *     an upgrade asks for).
 *
 * Computed identically on local + cloud via
 * {@link passwordPromptFromState} so the dev's UI gating code is
 * engine-agnostic.
 */
import type { DocumentSecurityState } from './DocumentSecurityService';

export type PasswordPrompt =
  | { readonly state: 'none' }
  | { readonly state: 'required'; readonly hint: 'user' | 'owner' | null }
  | { readonly state: 'optional'; readonly hint: 'owner' };

/**
 * Derive the high-level password prompt from the raw security state.
 *
 * The function is pure and total — every `DocumentSecurityState`
 * maps to exactly one `PasswordPrompt`. Use this as the SINGLE source
 * of truth wherever the SDK exposes a "do you need a password?" flag:
 * both `LocalDocumentSecurityService` and `CloudDocumentSecurityService`
 * call it, so the contract can never drift.
 *
 * Mapping rules (top to bottom; first match wins):
 *
 *   1. encryption.state === 'none'
 *      → { state: 'none' }              the document isn't encrypted
 *
 *   2. !permissions.known
 *      → { state: 'required', hint: null }   we haven't probed yet; can't
 *                                            tell user-vs-owner; show
 *                                            generic prompt
 *
 *   3. requiresPassword && openedAs === 'none'
 *      → { state: 'required', hint: 'user' }   encrypted, anonymous open
 *                                              failed → user pwd needed
 *
 *   4. openedAs === 'owner'
 *      → { state: 'none' }              already at the top — nothing more
 *                                       to unlock
 *
 *   5. permissions.canUpgradeToOwner === true
 *      → { state: 'optional', hint: 'owner' }   open as user (or as none
 *                                               for owner-pwd-only docs)
 *                                               but more is available
 *
 *   6. fallthrough → { state: 'none' }   open and nothing more available
 */
export function passwordPromptFromState(state: DocumentSecurityState): PasswordPrompt {
  if (state.encryption.state === 'none') {
    return { state: 'none' };
  }

  if (!state.permissions.known) {
    return { state: 'required', hint: null };
  }

  if (state.encryption.requiresPassword && state.permissions.openedAs === 'none') {
    return { state: 'required', hint: 'user' };
  }

  if (state.permissions.openedAs === 'owner') {
    return { state: 'none' };
  }

  if (state.permissions.canUpgradeToOwner) {
    return { state: 'optional', hint: 'owner' };
  }

  return { state: 'none' };
}

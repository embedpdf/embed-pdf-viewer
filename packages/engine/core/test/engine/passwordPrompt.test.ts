/**
 * Anti-drift pin for `passwordPromptFromState`. Every documented case
 * in the function's docstring has a test here so future edits can't
 * silently change the contract local + cloud both rely on.
 *
 * If you change a mapping rule, this test MUST be updated explicitly
 * — and that's the point.
 */
import { describe, expect, it } from 'vitest';
import { passwordPromptFromState } from '../../src/engine/passwordPrompt';
import type { DocumentSecurityState } from '../../src/engine/DocumentSecurityService';

function state(overrides: Partial<DocumentSecurityState> = {}): DocumentSecurityState {
  return {
    encryption: { state: 'none', requiresPassword: false, ...(overrides.encryption ?? {}) },
    permissions: {
      known: true,
      bits: null,
      allAllowed: true,
      openedAs: 'none',
      securityHandlerRevision: null,
      canUpgradeToOwner: false,
      ...(overrides.permissions ?? {}),
    },
    access: { required: false, reasons: [], ...(overrides.access ?? {}) },
  };
}

describe('passwordPromptFromState', () => {
  it('unencrypted doc → none', () => {
    expect(passwordPromptFromState(state())).toEqual({ state: 'none' });
  });

  it('encrypted + permissions not yet probed → required with null hint', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: true },
      permissions: { known: false } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'required', hint: null });
  });

  it('encrypted + anonymous open failed (openedAs=none) + requiresPassword → required with user hint', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: true },
      permissions: {
        known: true,
        openedAs: 'none',
      } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'required', hint: 'user' });
  });

  it('encrypted + opened as owner → none (already at the top)', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: true },
      permissions: {
        known: true,
        openedAs: 'owner',
        canUpgradeToOwner: false,
      } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'none' });
  });

  it('opened as user + canUpgradeToOwner → optional with owner hint', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: true },
      permissions: {
        known: true,
        openedAs: 'user',
        canUpgradeToOwner: true,
      } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'optional', hint: 'owner' });
  });

  it('owner-password-only doc (anonymous read works, canUpgradeToOwner true) → optional with owner hint', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: false },
      permissions: {
        known: true,
        openedAs: 'none',
        canUpgradeToOwner: true,
      } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'optional', hint: 'owner' });
  });

  it('opened, no upgrade path → none', () => {
    const s = state({
      encryption: { state: 'encrypted', requiresPassword: true },
      permissions: {
        known: true,
        openedAs: 'user',
        canUpgradeToOwner: false,
      } as DocumentSecurityState['permissions'],
    });
    expect(passwordPromptFromState(s)).toEqual({ state: 'none' });
  });

  it('discriminated-union narrowing: required carries hint, optional carries owner hint, none has no hint', () => {
    // Compile-time check that switch narrowing works; runtime asserts
    // for completeness.
    const cases: ReturnType<typeof passwordPromptFromState>[] = [
      { state: 'none' },
      { state: 'required', hint: null },
      { state: 'required', hint: 'user' },
      { state: 'optional', hint: 'owner' },
    ];
    for (const c of cases) {
      switch (c.state) {
        case 'none':
          // @ts-expect-error — none has no hint
          c.hint;
          break;
        case 'required':
          expect(['user', 'owner', null]).toContain(c.hint);
          break;
        case 'optional':
          expect(c.hint).toBe('owner');
          break;
      }
    }
  });
});

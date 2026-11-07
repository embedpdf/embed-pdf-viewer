/**
 * Nothing the page passes to `open()` is ignored silently: in development the
 * cloud engine says which `identity` fields the document doesn't act for, and
 * that `scope` never applies, once each.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  resetDevWarnings,
  type DocumentHandle,
  type Identity,
} from '@embedpdf/engine-core/runtime';
import { warnUnusedOpenOptions } from '../src/unusedOpenOptions';

const actingFor = (identity: Identity | null) =>
  ({ id: 'doc', security: { identity } }) as DocumentHandle;

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

const said = () => warn.mock.calls.map((call) => String(call[0]));

describe('what the page passed and the document does not use', () => {
  test('says nothing when the document acts for who the page said', () => {
    const dana = { userId: 'u_381', displayName: 'Dana Smith' };
    warnUnusedOpenOptions({ identity: dana }, actingFor(dana), 'token');
    warnUnusedOpenOptions(undefined, actingFor(dana), 'grant');
    expect(warn).not.toHaveBeenCalled();
  });

  test('names the fields a token decided otherwise, once', () => {
    const page = { userId: 'u_381', displayName: 'Dana Smith' };
    warnUnusedOpenOptions(
      { identity: page },
      actingFor({ userId: 'u_381', displayName: 'Bob' }),
      'token',
    );
    warnUnusedOpenOptions(
      { identity: page },
      actingFor({ userId: 'u_381', displayName: 'Bob' }),
      'token',
    );
    expect(said()).toEqual([
      expect.stringMatching(/\(displayName\): the document's token says who the user is/),
    ]);
  });

  test('on a grant, says what a grant takes', () => {
    warnUnusedOpenOptions(
      { identity: { userId: 'u_381', displayName: 'Dana Smith' } },
      actingFor({ userId: 'visitor_1' }),
      'grant',
    );
    expect(said()).toEqual([
      expect.stringMatching(/\(userId, displayName\): a grant takes only the fields it asks/),
    ]);
  });

  test('scope never applies on the cloud engine', () => {
    warnUnusedOpenOptions({ scope: ['doc.open'] }, actingFor(null), 'token');
    expect(said()).toEqual([expect.stringMatching(/doesn't use `scope`/)]);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { bytesInput, makeHandle } from './helpers';
import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentGrant,
  type Engine,
  type OpenInput,
  type OpenOptions,
  type GrantOpenRequest,
  type VisitorIdentityRequest,
} from '@embedpdf/engine-core/runtime';

/**
 * A document from a grant: before it opens, its tab shows what the grant waits for (its
 * passphrase, or who the visitor is), and `retry()` opens it again with the answer; once open, a
 * change waiting for the visitor's answers shows on the document until they `identify()` or
 * `declineIdentity()`, and a passphrase or questions the grant got after it opened show until
 * `retry()` gives them.
 */

const ASKED: VisitorIdentityRequest = {
  fields: { displayName: 'required', email: 'optional' },
  missing: ['displayName'],
  invalid: [],
  purpose: 'We follow up on every quote.',
};

describe('documents · grants', () => {
  it('a failed open says what the grant waits for, and retry() opens it with the answers', async () => {
    const opened: { input: OpenInput; options: OpenOptions | undefined }[] = [];
    const engine = {
      open: (input: OpenInput, options?: OpenOptions) => {
        opened.push({ input, options });
        if (input.kind !== 'grant') return Promise.reject(new Error('network down'));
        if (input.passphrase !== 'open sesame') {
          return Promise.reject(
            new EngineError(EngineErrorCode.GrantPassphraseRequired, 'grant exchange failed'),
          );
        }
        if (!options?.identity?.displayName) {
          return Promise.reject(
            new EngineError(EngineErrorCode.VisitorIdentityRequired, 'answer first', {
              details: { ...ASKED, grantCode: 'VisitorIdentityRequired', status: 422 },
            }),
          );
        }
        return Promise.resolve(makeHandle('shared-doc'));
      },
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    // Who the page knows the user is: the visitor's answers add to it.
    const kernel = createKernel({
      engine,
      plugins: [],
      settings: { identity: { userId: 'u_381', organization: 'Acme' } },
    });
    await kernel.start();
    const { documents } = kernel;

    // Through a function, as the viewer element opens its `src`.
    await expect(
      documents.open(async () => ({ kind: 'grant', grant: 'grt_x' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const id = documents.getOrder()[0]!;
    expect(documents.get(id)).toMatchObject({
      status: 'error',
      grantRequest: { kind: 'passphrase', passphraseProvided: false },
    });

    await expect(documents.retry(id, { passphrase: 'wrong' })).rejects.toBeDefined();
    expect(documents.get(id)?.grantRequest).toEqual({
      kind: 'passphrase',
      passphraseProvided: true,
    });

    await expect(documents.retry(id, { passphrase: 'open sesame' })).rejects.toBeDefined();
    expect(documents.get(id)?.grantRequest).toEqual({ kind: 'identity', request: ASKED });

    // The passphrase given before stays; the answers add to who the page said the user is.
    await expect(
      documents.retry(id, { identity: { displayName: 'Ada', email: 'ada@example.com' } }),
    ).resolves.toMatchObject({ document: { id: 'shared-doc', status: 'ready' } });
    expect(opened.at(-1)).toEqual({
      input: { kind: 'grant', grant: 'grt_x', passphrase: 'open sesame' },
      options: expect.objectContaining({
        identity: {
          userId: 'u_381',
          organization: 'Acme',
          displayName: 'Ada',
          email: 'ada@example.com',
        },
      }),
    });
    expect(documents.get('shared-doc')?.grantRequest).toBeUndefined();

    // Answers go only to a grant.
    await expect(documents.open(bytesInput('plain'))).rejects.toThrow('network down');
    expect(documents.get('plain')?.grantRequest).toBeUndefined();
    await expect(documents.retry('plain', { passphrase: 'x' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await kernel.destroy();
  });

  it('a change waiting for the visitor shows on the document until they answer or decline', async () => {
    let ask: ((request: VisitorIdentityRequest) => void) | null = null;
    let identityRequest: VisitorIdentityRequest | null = ASKED;
    const decline = vi.fn();
    const grant: DocumentGrant = {
      layerMode: 'per-visitor',
      keep: true,
      get identityRequest() {
        return identityRequest;
      },
      identify: (answers) =>
        AbortablePromise.run(async () => {
          if (answers.email === 'nope') {
            throw new EngineError(EngineErrorCode.VisitorIdentityRequired, 'answer first', {
              details: { ...ASKED, invalid: ['email'] },
            });
          }
          identityRequest = null;
        }),
      onIdentityRequest: (listener) => {
        ask = listener;
        return () => {
          ask = null;
        };
      },
      decline,
      openRequest: null,
      onOpenRequest: () => () => {},
      resume: () => AbortablePromise.run(async () => {}),
    };
    const handle = Object.assign(makeHandle('a'), { grant });
    const engine = {
      open: () => Promise.resolve(handle),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    await kernel.start();
    const { documents } = kernel;
    await documents.open({ kind: 'grant', grant: 'grt_y' });
    expect(documents.get('a')?.identityRequest).toBeUndefined();

    ask!(ASKED);
    expect(documents.get('a')?.identityRequest).toEqual(ASKED);
    await expect(
      documents.identify('a', { displayName: 'Ada', email: 'nope' }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    expect(documents.get('a')?.identityRequest).toMatchObject({ invalid: ['email'] });
    await documents.identify('a', { displayName: 'Ada' });
    expect(documents.get('a')?.identityRequest).toBeUndefined();

    ask!(ASKED);
    documents.declineIdentity('a');
    expect(decline).toHaveBeenCalledTimes(1);
    expect(documents.get('a')?.identityRequest).toBeUndefined();

    // Closing the document stops listening.
    await documents.close('a');
    expect(ask).toBeNull();
    await kernel.destroy();
  });

  it('a passphrase or questions the grant got after it opened show until retry() gives them', async () => {
    let ask: ((request: GrantOpenRequest) => void) | null = null;
    let openRequest: GrantOpenRequest | null = null;
    const given: unknown[] = [];
    const grant: DocumentGrant = {
      layerMode: 'shared',
      keep: true,
      identityRequest: null,
      identify: () => AbortablePromise.run(async () => {}),
      onIdentityRequest: () => () => {},
      decline: () => {},
      get openRequest() {
        return openRequest;
      },
      onOpenRequest: (listener) => {
        ask = listener;
        return () => {
          ask = null;
        };
      },
      resume: (answer) =>
        AbortablePromise.run(async () => {
          given.push(answer);
          if (answer.passphrase !== 'open sesame') {
            openRequest = { kind: 'passphrase', passphraseProvided: true };
            throw new EngineError(EngineErrorCode.GrantPassphraseRequired, 'grant exchange failed');
          }
          openRequest = null;
        }),
    };
    const handle = Object.assign(makeHandle('b'), { grant });
    const engine = {
      open: () => Promise.resolve(handle),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    await kernel.start();
    const { documents } = kernel;
    await documents.open({ kind: 'grant', grant: 'grt_z' });
    // Nothing asked: retry() is for failed documents only.
    await expect(documents.retry('b', { passphrase: 'x' })).rejects.toMatchObject({
      code: 'invalid-input',
    });

    openRequest = { kind: 'passphrase', passphraseProvided: false };
    ask!(openRequest);
    expect(documents.get('b')).toMatchObject({ status: 'ready', grantRequest: openRequest });

    await expect(documents.retry('b', { passphrase: 'wrong' })).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(documents.get('b')?.grantRequest).toEqual({
      kind: 'passphrase',
      passphraseProvided: true,
    });
    // The same document goes on: not opened again.
    await expect(documents.retry('b', { passphrase: 'open sesame' })).resolves.toMatchObject({
      document: { id: 'b', status: 'ready' },
    });
    expect(documents.get('b')?.grantRequest).toBeUndefined();
    expect(given).toEqual([{ passphrase: 'wrong' }, { passphrase: 'open sesame' }]);

    await documents.close('b');
    expect(ask).toBeNull();
    await kernel.destroy();
  });
});

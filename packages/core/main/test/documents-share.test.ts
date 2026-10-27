import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { bytesInput, makeHandle } from './helpers';
import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type DocumentShare,
  type Engine,
  type OpenInput,
  type VisitorIdentityRequest,
} from '@embedpdf/engine-core/runtime';

/**
 * A document from a share link: before it opens, its tab shows what the link waits for (its
 * passphrase, or who the visitor is), and `retry()` opens it again with the answer; once open, a
 * change waiting for the visitor's answers shows on the document until they `identify()` or
 * `declineIdentity()`.
 */

const ASKED: VisitorIdentityRequest = {
  fields: { displayName: 'required', email: 'optional' },
  missing: ['displayName'],
  invalid: [],
  purpose: 'We follow up on every quote.',
};

describe('documents · share links', () => {
  it('a failed open says what the link waits for, and retry() opens it with the answers', async () => {
    const opened: OpenInput[] = [];
    const engine = {
      open: (input: OpenInput) => {
        opened.push(input);
        if (input.kind !== 'share') return Promise.reject(new Error('network down'));
        if (input.sharePassword !== 'open sesame') {
          return Promise.reject(
            new EngineError(EngineErrorCode.SharePasswordRequired, 'share exchange failed'),
          );
        }
        if (!input.visitor?.displayName) {
          return Promise.reject(
            new EngineError(EngineErrorCode.VisitorIdentityRequired, 'answer first', {
              details: { ...ASKED, shareCode: 'VisitorIdentityRequired', status: 422 },
            }),
          );
        }
        return Promise.resolve(makeHandle('shared-doc'));
      },
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    await kernel.start();
    const { documents } = kernel;

    // Through a function, as the viewer element opens its `src`.
    await expect(
      documents.open(async () => ({ kind: 'share', shareToken: 'shr_x' })),
    ).rejects.toMatchObject({ code: 'permission-denied' });
    const id = documents.getOrder()[0]!;
    expect(documents.get(id)).toMatchObject({
      status: 'error',
      shareRequest: { kind: 'passphrase', passwordProvided: false },
    });

    await expect(documents.retry(id, { sharePassword: 'wrong' })).rejects.toBeDefined();
    expect(documents.get(id)?.shareRequest).toEqual({
      kind: 'passphrase',
      passwordProvided: true,
    });

    await expect(documents.retry(id, { sharePassword: 'open sesame' })).rejects.toBeDefined();
    expect(documents.get(id)?.shareRequest).toEqual({ kind: 'identity', request: ASKED });

    // The passphrase given before stays; the answers add to the source.
    await expect(
      documents.retry(id, { visitor: { displayName: 'Ada', email: 'ada@example.com' } }),
    ).resolves.toMatchObject({ document: { id: 'shared-doc', status: 'ready' } });
    expect(opened.at(-1)).toEqual({
      kind: 'share',
      shareToken: 'shr_x',
      sharePassword: 'open sesame',
      visitor: { displayName: 'Ada', email: 'ada@example.com' },
    });
    expect(documents.get('shared-doc')?.shareRequest).toBeUndefined();

    // Answers go only to a share link.
    await expect(documents.open(bytesInput('plain'))).rejects.toThrow('network down');
    expect(documents.get('plain')?.shareRequest).toBeUndefined();
    await expect(documents.retry('plain', { sharePassword: 'x' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await kernel.destroy();
  });

  it('a change waiting for the visitor shows on the document until they answer or decline', async () => {
    let ask: ((request: VisitorIdentityRequest) => void) | null = null;
    let identityRequest: VisitorIdentityRequest | null = ASKED;
    const decline = vi.fn();
    const share: DocumentShare = {
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
    };
    const handle = Object.assign(makeHandle('a'), { share });
    const engine = {
      open: () => Promise.resolve(handle),
      destroy: () => Promise.resolve(),
    } as unknown as Engine;
    const kernel = createKernel({ engine, plugins: [] });
    await kernel.start();
    const { documents } = kernel;
    await documents.open({ kind: 'share', shareToken: 'shr_y' });
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
});

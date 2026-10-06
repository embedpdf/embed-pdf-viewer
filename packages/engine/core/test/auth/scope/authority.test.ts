import { describe, expect, it } from 'vitest';
import {
  authorizeAnnotationDelete,
  authorizeAnnotationUpdate,
  decodePdfBits,
  PermissionDenied,
  type AnnotationAuthority,
  type Identity,
} from '../../../src/auth/scope';
import { EngineError } from '../../../src/errors/EngineError';
import { EngineErrorCode } from '../../../src/errors/EngineErrorCode';
import type { AnnotationRef } from '../../../src/identity/AnnotationRef';

const BOB: Identity = { userId: 'bob', displayName: 'Bob', groupId: '5', groups: ['5'] };
const bob = (scope: string[]): AnnotationAuthority => ({
  identity: BOB,
  grants: { scope, pdfBits: decodePdfBits(null) },
});
const SELF_ONLY = bob([
  'doc.annotate.modify',
  'annotations:update:self',
  'annotations:delete:self',
]);
const TENANT: AnnotationAuthority = { identity: BOB, grants: null };

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: { kind: 'objectNumber', objectNumber: 3 },
  objectNumber,
});

describe('authorizeAnnotationUpdate', () => {
  it("refuses another person's annotation to a self-only caller", () => {
    expect(() => authorizeAnnotationUpdate(SELF_ONLY, { userId: 'alice' }, undefined)).toThrow(
      PermissionDenied,
    );
  });

  it('stamps the editor, and no group unless the patch reassigns it', () => {
    expect(
      authorizeAnnotationUpdate(SELF_ONLY, { userId: 'bob', groupId: '5' }, undefined),
    ).toEqual({ userId: 'bob', displayName: 'Bob' });
    expect(authorizeAnnotationUpdate(SELF_ONLY, { userId: 'bob', groupId: '5' }, '5')).toEqual({
      userId: 'bob',
      displayName: 'Bob',
    });
  });

  it("reassigns to the caller's own group without a grant, to another only with one", () => {
    expect(authorizeAnnotationUpdate(SELF_ONLY, { userId: 'bob', groupId: '9' }, '5')).toEqual({
      userId: 'bob',
      displayName: 'Bob',
      groupId: '5',
    });
    expect(() => authorizeAnnotationUpdate(SELF_ONLY, { userId: 'bob' }, 'legal')).toThrow(
      expect.objectContaining({ required: 'annotations:set-group:group=legal' }),
    );
    const granted = bob(['doc.annotate.modify', 'annotations:set-group:group=legal']);
    expect(authorizeAnnotationUpdate(granted, { userId: 'bob' }, 'legal')?.groupId).toBe('legal');
  });

  it('never removes an existing group', () => {
    const removed = (() => {
      try {
        authorizeAnnotationUpdate(TENANT, { userId: 'bob', groupId: '5' }, null);
      } catch (error) {
        return error;
      }
    })();
    expect(EngineError.is(removed, EngineErrorCode.InvalidArg)).toBe(true);
    // `null` sent back for an annotation without a group changes nothing.
    expect(authorizeAnnotationUpdate(TENANT, { userId: 'bob' }, null)).toEqual({
      userId: 'bob',
      displayName: 'Bob',
    });
  });

  it('checks nothing for a tenant, and still stamps who it acts for', () => {
    expect(authorizeAnnotationUpdate(TENANT, { userId: 'alice', groupId: '1' }, 'legal')).toEqual({
      userId: 'bob',
      displayName: 'Bob',
      groupId: 'legal',
    });
  });
});

describe('authorizeAnnotationDelete', () => {
  it('refuses all of a thread when one member is refused, naming each', () => {
    const members = [
      { ref: ref(10), userId: 'bob' },
      { ref: ref(11), userId: 'alice' },
      { ref: ref(12), userId: 'carol' },
    ];
    expect(() => authorizeAnnotationDelete(SELF_ONLY, members)).toThrow(
      expect.objectContaining({ required: 'annotations:delete', refs: [ref(11), ref(12)] }),
    );
  });

  it("allows a caller's own thread, and anything for a tenant", () => {
    expect(() =>
      authorizeAnnotationDelete(SELF_ONLY, [{ ref: ref(10), userId: 'bob' }]),
    ).not.toThrow();
    expect(() =>
      authorizeAnnotationDelete(TENANT, [{ ref: ref(11), userId: 'alice' }]),
    ).not.toThrow();
  });
});

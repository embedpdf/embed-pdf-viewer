import { describe, expect, it } from 'vitest';
import type { DocumentHead } from '@embedpdf/engine-core/wire';

import { CloudDocumentHandle } from '../src/document/CloudDocumentHandle';
import { HttpClient } from '../src/transport/HttpClient';

/**
 * The `security.allowsAnnotation*` mirrors on the cloud SDK's
 * local-fallback path: raw scope + identity decoded (unverified) from
 * the doc JWT, PDF bits from /head. Pure client logic — no server —
 * exercising the SAME `checkCollab`/`checkSetGroup` resolvers the
 * server's route layer enforces with. The engine-local twin
 * (`packages/engine/main/test/security-collab.test.ts`) runs the same
 * scenarios through a real WASM open; same inputs must answer the same.
 */

const DOC_ID = 'doc-sec-mirrors';

function base64UrlJson(value: unknown): string {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function docToken(claims: Record<string, unknown>): string {
  return [
    base64UrlJson({ alg: 'none', typ: 'JWT' }),
    base64UrlJson({ doc_id: DOC_ID, layer_name: 'default', sub: 'stub-user', ...claims }),
    'sig',
  ].join('.');
}

function head(): DocumentHead {
  return {
    id: DOC_ID,
    baseSha: 'stub-sha',
    storageSizeBytes: 1024,
    docVersion: 1,
    state: 'ready',
    encryption: { state: 'none', requiresPassword: false },
    permissions: {
      known: true,
      bits: 0xffffffff,
      allAllowed: true,
      openedAs: 'none',
      securityHandlerRevision: null,
      canUpgradeToOwner: false,
    },
    access: { required: false, reasons: [] },
  } as unknown as DocumentHead;
}

const http = new HttpClient({
  baseUrl: 'http://stub',
  token: 'tok',
  fetch: async () => new Response('{}', { status: 200 }),
});

const openWith = (claims: Record<string, unknown> | null) =>
  new CloudDocumentHandle(http, DOC_ID, 'default', head(), claims ? docToken(claims) : null);

describe('security collab mirrors (cloud SDK, token-fallback path)', () => {
  it('no token → fail closed on every mirror', () => {
    const doc = openWith(null);
    expect(doc.security.allowsAnnotationCreate()).toBe(false);
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'me' })).toBe(false);
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(false);
  });

  it('wildcard scope allows everything', () => {
    const doc = openWith({ scope: ['*'] });
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
    expect(doc.security.allowsAnnotationMutation('delete', {})).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
  });

  it('narrowing: annotations:update:self shadows modify for update only', () => {
    const doc = openWith({
      scope: ['doc.annotate.modify', 'annotations:update:self'],
      user_id: 'me',
    });
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'me' })).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'alice' })).toBe(false);
    expect(doc.security.allowsAnnotationMutation('update', {})).toBe(false);
    // Delete has no collab scope → coarse fallback still answers.
    expect(doc.security.allowsAnnotationMutation('delete', { userId: 'alice' })).toBe(true);
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
  });

  it('group grant: create from own identity, targets need the stamp + membership', () => {
    const doc = openWith({
      scope: ['annotations:*:group=legal'],
      user_id: 'me',
      group_id: 'legal',
      groups: ['legal'],
    });
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { groupId: 'legal' })).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { groupId: 'other' })).toBe(false);
    expect(doc.security.allowsAnnotationMutation('update', {})).toBe(false);
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('other')).toBe(false);
  });

  it("assigning the caller's own default group needs no grant", () => {
    const doc = openWith({ scope: ['doc.annotate.modify'], user_id: 'me', group_id: 'legal' });
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('other')).toBe(false);
  });
});

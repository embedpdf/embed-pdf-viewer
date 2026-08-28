import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { DocumentHandle, PdfEngine } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'engine-runtime-demo',
  'public',
  'annotations.pdf',
);

/**
 * The `security.allowsAnnotation*` mirrors on engine-local: every case
 * here exercises the SAME `checkCollab`/`checkSetGroup` resolvers the
 * annotation service enforces with, through a real WASM open — so
 * these are contract tests for the mirror wiring, not the resolver
 * (the resolver has its own unit suite in engine-core).
 */
describe('security collab mirrors (engine-local, wasm runtime)', () => {
  let engine: PdfEngine;
  let bytes: Uint8Array;
  const handles: DocumentHandle[] = [];

  let openCount = 0;
  const open = async (options?: {
    scope?: string[];
    identity?: Record<string, unknown>;
  }): Promise<DocumentHandle> => {
    const doc = await engine.open(
      { kind: 'bytes', id: `collab-mirrors-${openCount++}`, bytes: bytes.slice() },
      options as never,
    );
    handles.push(doc);
    return doc;
  };

  beforeAll(async () => {
    bytes = new Uint8Array(await readFile(fixturePath));
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
  });

  afterAll(async () => {
    for (const doc of handles) await doc.close();
    await engine.destroy?.();
  });

  test('default open (wildcard scope) allows everything', async () => {
    const doc = await open();
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'anyone' })).toBe(true);
    expect(doc.security.allowsAnnotationMutation('delete', {})).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
  });

  test('coarse doc.annotate.modify: any target mutable, set-group NOT implied', async () => {
    const doc = await open({
      scope: ['doc.annotate.modify'],
      identity: { user_id: 'me' },
    });
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'alice' })).toBe(true);
    expect(doc.security.allowsAnnotationMutation('delete', {})).toBe(true);
    // Set-group is a cloud-only assignment authority — decoupled from modify.
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(false);
  });

  test('narrowing: annotations:update:self SHADOWS modify for update only', async () => {
    const doc = await open({
      scope: ['doc.annotate.modify', 'annotations:update:self'],
      identity: { user_id: 'me' },
    });
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'me' })).toBe(true);
    // The applicable narrowed grant shadows the coarse fallback…
    expect(doc.security.allowsAnnotationMutation('update', { userId: 'alice' })).toBe(false);
    expect(doc.security.allowsAnnotationMutation('update', {})).toBe(false);
    // …but ONLY for its action: delete has no collab scope, falls back to modify.
    expect(doc.security.allowsAnnotationMutation('delete', { userId: 'alice' })).toBe(true);
  });

  test('group grant: create derives from own identity, targets need the group stamp', async () => {
    const doc = await open({
      scope: ['annotations:*:group=legal'],
      identity: { user_id: 'me', group_id: 'legal', groups: ['legal'] },
    });
    // Self-target carries the caller's default group → matches the filter.
    expect(doc.security.allowsAnnotationCreate()).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { groupId: 'legal' })).toBe(true);
    expect(doc.security.allowsAnnotationMutation('update', { groupId: 'other' })).toBe(false);
    expect(doc.security.allowsAnnotationMutation('update', {})).toBe(false);
    // Action wildcard includes set-group for the granted destination.
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('other')).toBe(false);
  });

  test('assigning the caller\'s own default group needs no grant', async () => {
    const doc = await open({
      scope: ['doc.annotate.modify'],
      identity: { user_id: 'me', group_id: 'legal' },
    });
    expect(doc.security.allowsAnnotationGroupAssignment('legal')).toBe(true);
    expect(doc.security.allowsAnnotationGroupAssignment('other')).toBe(false);
  });
});

/**
 * What a document's signatures forbid, over the cloud engine: the server
 * refuses it on every route, for every caller (a `*` token, a scoped token, a
 * tenant token), and the client's `security` answers as the server does —
 * the same rules the local engine's scope guard applies.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createTestSigner, sign } from '@embedpdf/core-signature';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type DocumentHandle,
} from '@embedpdf/engine-core/runtime';
import { cloudEngine } from '../src/index';
import type { CloudDocumentSecurityService } from '../src/document/CloudDocumentSecurityService';
import {
  buildDbSeededFixture,
  docScopedToken,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures');
const fixture = (name: string) => resolve(fixtures, name);

const TENANT_ID = 'cloud-protection-tenant';
const CERTIFIED = 'cloud-protection-certified';
const TO_CERTIFY = 'cloud-protection-to-certify';
const FIELD_LOCK = 'cloud-protection-field-lock';
const UNSIGNED = 'cloud-protection-unsigned';

/** A scope that grants everything a certification can take away, and reading. */
const SCOPED = [
  'doc.open',
  'doc.render',
  'doc.forms.read',
  'doc.forms.fill',
  'doc.forms.modify',
  'doc.annotate.read',
  'doc.annotate.modify',
  'doc.pages.assemble',
  'annotations:*:all',
];

let fx: DbSeededFixture;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-protection-secret' });
  await seedDocumentFromBytes(fx, TENANT_ID, CERTIFIED, fixture('signed_certified.pdf'), 1);
  await seedDocumentFromBytes(fx, TENANT_ID, TO_CERTIFY, fixture('unsigned_sigfield.pdf'), 1);
  await seedDocumentFromBytes(fx, TENANT_ID, FIELD_LOCK, fixture('signed_fieldmdp.pdf'), 1);
  await seedDocumentFromBytes(fx, TENANT_ID, UNSIGNED, fixture('toggle_fields.pdf'), 1);
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

type Caller = 'doc *' | 'doc scoped' | 'tenant';

async function open(docId: string, caller: Caller = 'doc *') {
  const token =
    caller === 'tenant'
      ? tenantToken(fx, TENANT_ID)
      : docScopedToken(fx, TENANT_ID, docId, caller === 'doc scoped' ? SCOPED : ['*']);
  const engine = cloudEngine({ baseUrl: fx.baseUrl, token });
  const doc = await engine.open({ kind: 'id', id: docId });
  return {
    doc,
    close: async () => {
      await doc.close();
      await engine.destroy();
    },
  };
}

const errorCode = async (pending: Promise<unknown>): Promise<string> => {
  try {
    await pending;
    return 'ok';
  } catch (error) {
    return error instanceof EngineError ? error.code : `not an engine error: ${String(error)}`;
  }
};

async function firstPage(doc: DocumentHandle) {
  return (await doc.pages.list()).pages[0]!.ref;
}

const square = { subtype: 'square', box: { x: 10, y: 10, width: 40, height: 40 } } as const;

describe('signature protection (cloud SDK, real runtime)', () => {
  test.each<Caller>(['doc *', 'doc scoped', 'tenant'])(
    'a certification at permission 2 refuses annotations and page changes (%s)',
    async (caller) => {
      const { doc, close } = await open(CERTIFIED, caller);
      try {
        // Known from the moment open() returns.
        expect(doc.security.allows('doc.forms.fill')).toBe(true);
        expect(doc.security.allows('doc.annotate.modify')).toBe(false);
        expect(doc.security.allows('doc.pages.assemble')).toBe(false);
        expect(doc.security.allows('doc.forms.modify')).toBe(false);
        expect(doc.security.allowsAnnotation('create')).toBe(false);
        expect(doc.security.allowsAnnotation('update', {})).toBe(false);

        const page = await firstPage(doc);
        expect(await errorCode(doc.page(page).annotations.create(square))).toBe(
          EngineErrorCode.ProtectedDocument,
        );
        expect(await errorCode(doc.pages.rotate([page], 90))).toBe(
          EngineErrorCode.ProtectedDocument,
        );
      } finally {
        await close();
      }
    },
  );

  test('/access leaves out what the certification forbids', async () => {
    const { doc, close } = await open(CERTIFIED, 'doc scoped');
    try {
      const security = doc.security as CloudDocumentSecurityService;
      const { access } = await security.establishAccess();
      expect(access?.protection?.certification?.permission).toBe(2);
      expect(access?.effectiveScope).toContain('doc.forms.fill');
      expect(access?.effectiveScope).not.toContain('doc.annotate.modify');
      expect(access?.effectiveScope).not.toContain('doc.pages.assemble');
      expect(doc.security.scope).toEqual(access?.effectiveScope);
      expect(doc.security.allows('doc.annotate.modify')).toBe(false);
    } finally {
      await close();
    }
  });

  test('a certification made through the cloud applies at once, and to a later open', async () => {
    const signer = await createTestSigner({ commonName: 'Protection Signer' });
    const field = { kind: 'fqn', name: 'group.total' } as const;
    const signerSession = await open(TO_CERTIFY);
    try {
      const { doc } = signerSession;
      expect(doc.security.allows('doc.forms.fill')).toBe(true);
      expect(await errorCode(doc.forms.setValue(field, { type: 'text', value: 'before' }))).toBe(
        'ok',
      );
      await sign(doc, {
        field: { kind: 'fqn', name: 'sig' },
        certify: { permission: 1 },
        key: signer,
      });

      // Permission 1: nothing may change, not even the form.
      expect(doc.security.allows('doc.forms.fill')).toBe(false);
      expect(doc.security.allows('doc.annotate.modify')).toBe(false);
      expect(await errorCode(doc.forms.setValue(field, { type: 'text', value: 'after' }))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
      const page = await firstPage(doc);
      expect(await errorCode(doc.page(page).annotations.create(square))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
    } finally {
      await signerSession.close();
    }

    const later = await open(TO_CERTIFY, 'doc scoped');
    try {
      expect(later.doc.security.allows('doc.forms.fill')).toBe(false);
      expect(await errorCode(later.doc.forms.setValue(field, { type: 'text', value: 'x' }))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
    } finally {
      await later.close();
    }
  });

  test('an approval signature locks only its fields; the rest stays writable', async () => {
    const { doc, close } = await open(FIELD_LOCK);
    try {
      // A plain approval declares no level: nothing is taken away as a capability.
      expect(doc.security.allows('doc.annotate.modify')).toBe(true);
      expect(doc.security.allows('doc.forms.fill')).toBe(true);
      expect(
        await errorCode(
          doc.forms.setValue({ kind: 'fqn', name: 'Text Box' }, { type: 'text', value: 'x' }),
        ),
      ).toBe(EngineErrorCode.ProtectedDocument);
      const page = await firstPage(doc);
      expect(await errorCode(doc.page(page).annotations.create(square))).toBe('ok');
    } finally {
      await close();
    }
  });

  test('an unsigned document refuses nothing', async () => {
    const { doc, close } = await open(UNSIGNED, 'tenant');
    try {
      expect(doc.security.allows('doc.annotate.modify')).toBe(true);
      expect(doc.security.allows('doc.pages.assemble')).toBe(true);
      const page = await firstPage(doc);
      expect(await errorCode(doc.page(page).annotations.create(square))).toBe('ok');
      expect(await errorCode(doc.pages.rotate([toPageRef(page.pageObjectNumber)], 90))).toBe('ok');
    } finally {
      await close();
    }
  });
});

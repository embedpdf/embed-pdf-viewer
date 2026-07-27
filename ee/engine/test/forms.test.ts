import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { runFormConformance, type ConformanceTestRunner } from '@embedpdf/engine-core/conformance';
import type { FormEffect, FormFieldRef } from '@embedpdf/engine-core/runtime';
import {
  javaScriptProgramFromActionTree,
  scriptFieldsFromSnapshot,
  type ScriptInput,
} from '../../../packages/core/acrojs/src';
import { createQuickJsSandbox } from '../../../packages/core/js-sandbox/src';
import { createCloudEngine } from '../src/index';
import {
  buildDbSeededFixture,
  seedDocumentFromBytes,
  teardownDbSeededFixture,
  tenantToken,
  type DbSeededFixture,
} from './_helpers/db-seeded-app';

const here = dirname(fileURLToPath(import.meta.url));
const resources = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'runtime',
  'runtime-src',
  'testing',
  'resources',
);

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

let fx: DbSeededFixture | undefined;
const TENANT_ID = 'cloud-forms-conformance-tenant';

// The suite opens several independent documents, so the engine carries a
// TENANT token (doc-scoped tokens bind to one docId). The import target is
// a second copy of toggle_fields.pdf — id-opened docs are server state, so
// the round-trip test can't mint one by re-opening bytes.
const DOCS = {
  toggleFields: { id: 'toggle-fields-cloud', file: 'toggle_fields.pdf', pages: 1 },
  orphanWidgets: { id: 'orphan-widgets-cloud', file: 'orphan_widgets.pdf', pages: 1 },
  choiceFields: { id: 'listbox-form-cloud', file: 'listbox_form.pdf', pages: 1 },
  importTarget: { id: 'toggle-fields-import-target-cloud', file: 'toggle_fields.pdf', pages: 1 },
  dynamicStamp: {
    id: 'dynamic-approval-stamp-cloud',
    file: 'EmbedPDF_Dynamic_Approval_Stamp.pdf',
    pages: 1,
  },
} as const;

beforeAll(async () => {
  fx = await buildDbSeededFixture({ secret: 'cloud-forms-conformance-secret' });
  for (const doc of Object.values(DOCS)) {
    const path =
      doc === DOCS.dynamicStamp
        ? resolve(
            here,
            '..',
            '..',
            '..',
            'packages',
            'core',
            'js-sandbox',
            'test',
            'fixtures',
            doc.file,
          )
        : resolve(resources, doc.file);
    await seedDocumentFromBytes(fx, TENANT_ID, doc.id, path, doc.pages);
  }
});

afterAll(async () => {
  await teardownDbSeededFixture(fx);
});

const fixture = (id: string) => ({
  id,
  bytes: async () => new Uint8Array(),
  expected: {},
});

runFormConformance(runner, {
  label: 'cloud engine (HTTP -> @cloudpdf/server, native runtime)',
  openKind: 'id',
  fixtures: {
    toggleFields: { ...fixture(DOCS.toggleFields.id), pageObjectNumber: 3 },
    orphanWidgets: fixture(DOCS.orphanWidgets.id),
    choiceFields: fixture(DOCS.choiceFields.id),
    importTarget: fixture(DOCS.importTarget.id),
  },
  makeEngine: () => {
    if (!fx) throw new Error('fixture not initialised');
    return createCloudEngine({
      baseUrl: fx.baseUrl,
      token: tenantToken(fx, TENANT_ID),
    });
  },
});

function sameRef(left: FormFieldRef, right: FormFieldRef): boolean {
  return left.kind === 'objectNumber' && right.kind === 'objectNumber'
    ? left.fieldObjectNumber === right.fieldObjectNumber
    : left.kind === 'fqn' && right.kind === 'fqn'
      ? left.name === right.name
      : false;
}

test('dynamic-stamp scripts feed the cloud effects sink and persist in its layer', async () => {
  if (!fx) throw new Error('fixture not initialised');
  const engine = createCloudEngine({
    baseUrl: fx.baseUrl,
    token: tenantToken(fx, TENANT_ID),
  });
  const doc = await engine.open({ kind: 'id', id: DOCS.dynamicStamp.id });
  const sandbox = await createQuickJsSandbox();

  try {
    const [snapshot, actions] = await Promise.all([doc.forms.list(), doc.actions!.read()]);
    const fields = scriptFieldsFromSnapshot(snapshot);
    const baseInput: Omit<ScriptInput, 'fields' | 'event'> = {
      document: {
        id: doc.id,
        fileName: 'proposal.pdf',
        pageCount: 1,
        pageNumber: 0,
      },
      identity: {
        name: 'Alex Morgan',
        loginName: 'alex',
        corporation: 'EmbedPDF',
        email: 'alex@example.com',
      },
      environment: {
        nowMs: Date.UTC(2026, 6, 15, 9, 30, 0),
        utcOffsetMinutes: 180,
        randomSeed: 7,
      },
    };
    const boot = sandbox.boot(
      actions.nameTreeScripts.map(({ action }) => javaScriptProgramFromActionTree(action)),
      { ...baseInput, fields, event: { kind: 'name-tree-boot' } },
    );
    expect(boot.error).toBeUndefined();

    const effects: FormEffect[] = [...boot.formEffects];
    for (const ref of snapshot.calculationOrder) {
      if (!ref) continue;
      const field = snapshot.fields.find((candidate) => sameRef(candidate.ref, ref));
      const tree = field?.actions?.calculate;
      if (!field || !tree) continue;
      const current = fields.find((candidate) => sameRef(candidate.ref, ref));
      const output = sandbox.run(javaScriptProgramFromActionTree(tree), {
        ...baseInput,
        fields,
        event: { kind: 'field-calculate', target: ref, value: current?.value ?? null },
      });
      expect(output.error).toBeUndefined();
      effects.push(...output.formEffects);
    }

    const eventTypes: string[] = [];
    const unsubscribe = doc.events.subscribe((event) => eventTypes.push(event.type));
    const applied = await doc.forms.applyEffects!(effects);
    unsubscribe();
    expect(applied.results.map(({ status }) => status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
    ]);
    expect(applied.meta).not.toBeNull();
    expect(eventTypes).toContain('form.effectsApplied');

    const reread = await doc.forms.list();
    expect(
      Object.fromEntries(reread.fields.map((field) => [field.name, field.valueEntry])),
    ).toEqual({
      approvedBy: { kind: 'scalar', value: 'Alex Morgan' },
      company: { kind: 'scalar', value: 'EmbedPDF' },
      stampDate: { kind: 'scalar', value: 'Jul 15, 2026' },
      documentName: { kind: 'scalar', value: 'proposal.pdf' },
    });
    expect((await doc.download({ mode: 'rewrite' })).byteLength).toBeGreaterThan(0);
  } finally {
    sandbox.dispose();
    await doc.close();
    await engine.destroy();
  }
});

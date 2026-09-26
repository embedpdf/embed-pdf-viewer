import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  runSignatureConformance,
  type ConformanceTestRunner,
  type SignatureConformanceFixtures,
} from '@embedpdf/engine-core/conformance';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const resources = resolve(here, 'fixtures');

const runner: ConformanceTestRunner = {
  describe,
  test,
  beforeAll,
  afterAll,
  expect: expect as unknown as ConformanceTestRunner['expect'],
};

const fixture = (id: string, file: string) => ({
  id,
  bytes: async () => new Uint8Array(await readFile(resolve(resources, file))),
  expected: {},
});

// Signed fixtures are synthetic: authored by the runtime fork's embedder
// tests and sealed with the test signer certificate (see fixtures/README.md).
const fixtures: SignatureConformanceFixtures = {
  unsignedForm: fixture('unsigned-form-pdf', 'toggle_fields.pdf'),
  twoApprovals: {
    ...fixture('signed-two-approvals-pdf', 'signed_two_approvals.pdf'),
    fieldNames: ['first', 'second'],
    textField: 'note',
  },
  certified: { ...fixture('signed-certified-pdf', 'signed_certified.pdf'), fieldName: 'cert' },
  fieldMdp: {
    ...fixture('signed-fieldmdp-pdf', 'signed_fieldmdp.pdf'),
    fieldName: 'sig1',
    lockedField: 'Text Box',
  },
  partialChain: fixture('signature-chain-pdf', 'signature_chain.pdf'),
  unsignedSigField: {
    ...fixture('unsigned-sigfield-pdf', 'unsigned_sigfield.pdf'),
    fieldName: 'sig',
    textField: 'group.total',
  },
  artwork: fixture('signature-artwork-pdf', 'signature_artwork.pdf'),
};

for (const openKind of ['bytes', 'layerBytes'] as const) {
  runSignatureConformance(runner, {
    label: `engine-local (inline transport, wasm runtime, ${openKind})`,
    openKind,
    fixtures,
    makeEngine: () => createLocalEngine({ runtime: { prefer: 'wasm' } }),
    makePermitEngine: () =>
      createLocalEngine({ runtime: { prefer: 'wasm' }, signedDocumentPolicy: 'permit' }),
  });
}

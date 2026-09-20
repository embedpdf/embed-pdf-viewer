/**
 * Immutable synthetic PDFs, authored independently of EmbedPDF's writer.
 * Cryptographic/structural assertions run immediately. Modification-policy
 * expectations are promoted separately after an Acrobat observation is reviewed.
 * A current engine answer is never used to invent an Acrobat expectation.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import { validateSignatures, type ModificationsVerdict } from '../src/index';

const corpus = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../engine/main/test/fixtures/signature-compat',
);

interface Fixture {
  id: string;
  file: string;
  directory: string;
  facts: {
    sha256: string;
    byteLength: number;
    revisionCount: number;
    signatures: {
      field: string;
      signedRevision: number;
      byteRange: number[];
      digestMatches: boolean;
    }[];
  };
  mutation?:
    | { kind: 'identical-object-rewrite'; objectNumber: number }
    | { kind: 'identical-object-rewrites'; objectNumbers: number[] };
}

interface PolicyExpectation {
  id: string;
  sha256: string;
  observationRunId: string;
  /** The engine policy the review was made against; a later policy must still honour it. */
  policyVersion?: number;
  /**
   * How the expected verdict relates to what Acrobat displayed. A stricter
   * policy is a deliberate difference: the test also checks that Acrobat did
   * accept the case, so a later Acrobat build cannot silently turn a
   * difference into an agreement.
   */
  relationship?: 'matches-observed-behavior' | 'intentional-stricter-policy' | 'engine-specific-definition';
  rationale: string;
  modifications: ModificationsVerdict[];
}

/** A working-tree engine snapshot: what every case answered when it was captured. */
interface EngineBaseline {
  cases: { id: string; signatures: { modifications: { verdict: ModificationsVerdict } }[] }[];
}

const manifests: { corpusVersion: string; cases: Fixture[]; certificateSha256: string }[] =
  await Promise.all(
    ['v1', 'v2', 'v3'].map(async (directory) => {
      const manifest = JSON.parse(
        await readFile(resolve(corpus, directory, 'manifest.json'), 'utf8'),
      );
      return {
        ...manifest,
        cases: manifest.cases.map((fixture: Omit<Fixture, 'directory'>) => ({
          ...fixture,
          directory,
        })),
      };
    }),
  );
const fixtures = manifests.flatMap((manifest) => manifest.cases);
const policy: { entries: PolicyExpectation[] } = JSON.parse(
  await readFile(resolve(corpus, 'policy-expectations.json'), 'utf8'),
);
// Cases without a promoted expectation must keep answering what the frozen
// baselines recorded: a rule change is an explicit edit to an expectation and
// its baseline, never drift.
const baselines: Map<string, ModificationsVerdict[]> = new Map();
for (const file of [
  'engine-baseline-v3.json',
  'engine-baseline-role-probes-v2.json',
  'engine-baseline-role-probes-v3.json',
]) {
  const baseline: EngineBaseline = JSON.parse(await readFile(resolve(corpus, file), 'utf8'));
  for (const c of baseline.cases) {
    baselines.set(
      c.id,
      c.signatures.map((s) => s.modifications.verdict),
    );
  }
}
const observations: {
  runs: {
    id: string;
    cases: {
      id: string;
      sha256: string;
      status: 'unobserved' | 'observed';
      signatures: {
        field: string;
        overallStatus: string | null;
        modificationMessage: string | null;
      }[];
    }[];
  }[];
} = JSON.parse(await readFile(resolve(corpus, 'observations.json'), 'utf8'));
const runtime = process.env.EPDF_SIGNATURE_CORPUS_RUNTIME === 'native' ? 'native' : 'wasm';
const report: unknown[] = [];
let engine: ReturnType<typeof createLocalEngine>;
let certificate: Uint8Array;

beforeAll(async () => {
  engine = createLocalEngine({ runtime: { prefer: runtime } });
  certificate = new Uint8Array(await readFile(resolve(corpus, 'keys/TEST-ONLY-signer.cer')));
  for (const manifest of manifests) {
    expect(createHash('sha256').update(certificate).digest('hex')).toBe(manifest.certificateSha256);
  }
});

afterAll(async () => {
  await engine?.destroy();
  if (process.env.EPDF_SIGNATURE_CORPUS_REPORT) {
    await writeFile(
      process.env.EPDF_SIGNATURE_CORPUS_REPORT,
      JSON.stringify(
        { corpusVersions: manifests.map((m) => m.corpusVersion), runtime, cases: report },
        null,
        2,
      ) + '\n',
    );
  }
});

describe('synthetic signature compatibility corpus', () => {
  test('every promoted policy expectation has recorded evidence for the exact PDF', () => {
    expect(new Set(fixtures.map((c) => c.id)).size).toBe(fixtures.length);
    expect(new Set(policy.entries.map((e) => e.id)).size).toBe(policy.entries.length);
    for (const entry of policy.entries) {
      const fixture = fixtures.find((c) => c.id === entry.id);
      expect(fixture, entry.id).toBeDefined();
      expect(entry.sha256).toBe(fixture!.facts.sha256);
      expect(entry.rationale.trim().length).toBeGreaterThan(0);
      const run = observations.runs.find((r) => r.id === entry.observationRunId);
      const observed = run?.cases.find((c) => c.id === entry.id && c.sha256 === entry.sha256);
      expect(observed?.status).toBe('observed');
      expect(observed?.signatures).toHaveLength(fixture!.facts.signatures.length);
      expect(entry.modifications).toHaveLength(fixture!.facts.signatures.length);
      for (const [index, signature] of observed!.signatures.entries()) {
        expect(signature.field).toBe(fixture!.facts.signatures[index].field);
        expect(signature.overallStatus?.trim().length ?? 0).toBeGreaterThan(0);
        expect(signature.modificationMessage?.trim().length ?? 0).toBeGreaterThan(0);
        if (entry.relationship === 'intentional-stricter-policy') {
          // A deliberate difference is only a difference while Acrobat accepts the case.
          expect(entry.modifications[index], entry.id).toBe('forbidden');
          expect(signature.overallStatus, entry.id).toMatch(/valid/i);
          expect(signature.overallStatus, entry.id).not.toMatch(/invalid/i);
        }
      }
    }
  });

  test.each(fixtures)('$id: $file', async (fixture) => {
    const path = resolve(corpus, fixture.directory, fixture.file);
    const bytes = new Uint8Array(await readFile(path));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.facts.sha256);
    expect(bytes.byteLength).toBe(fixture.facts.byteLength);
    const rewriteNumbers =
      fixture.mutation?.kind === 'identical-object-rewrite'
        ? [fixture.mutation.objectNumber]
        : (fixture.mutation?.objectNumbers ?? []);
    for (const objectNumber of rewriteNumbers) {
      const text = Buffer.from(bytes).toString('latin1');
      const bodies = [
        ...text.matchAll(
          new RegExp(`(?:^|[\\r\\n])${objectNumber} 0 obj\\s*([\\s\\S]*?)\\nendobj`, 'g'),
        ),
      ];
      expect(bodies.length).toBeGreaterThanOrEqual(2);
      expect(bodies.at(-1)![1]).toBe(bodies.at(-2)![1]);
    }
    const doc = await engine.open(
      runtime === 'native'
        ? { kind: 'layerFile', id: `corpus-${fixture.id}`, basePath: path }
        : { kind: 'bytes', id: `corpus-${fixture.id}`, bytes },
      { scope: ['*'] },
    );
    try {
      const snapshot = await doc.signatures!.list();
      expect(snapshot.chainValid).toBe(true);
      expect(snapshot.revisions).toHaveLength(fixture.facts.revisionCount);
      const verdicts = await validateSignatures(doc, {
        trust: { anchors: async () => [certificate] },
      });
      expect(verdicts).toHaveLength(fixture.facts.signatures.length);
      for (const [index, verdict] of verdicts.entries()) {
        const expected = fixture.facts.signatures[index];
        expect(verdict.signature.fieldName).toBe(expected.field);
        expect(verdict.signature.revisionIndex).toBe(expected.signedRevision);
        expect(verdict.signature.coverage).toBe('whole-revision');
        expect(verdict.signature.byteRange).toEqual(expected.byteRange);
        expect(verdict.integrity).toBe(expected.digestMatches ? 'valid' : 'invalid');
        expect(verdict.cryptography).toBe('valid');
        expect(verdict.trust).toBe('trusted');
      }
      const analysis = await doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      report.push({
        id: fixture.id,
        sha256: fixture.facts.sha256,
        signatures: verdicts.map((v) => ({
          field: v.signature.fieldName,
          integrity: v.integrity,
          cryptography: v.cryptography,
          trust: v.trust,
          modifications: v.modifications,
          summary: v.summary,
        })),
        policyVersion: analysis.policyVersion,
        steps: analysis.steps.map((s) => ({
          older: s.older,
          newer: s.newer,
          level: s.levelInForce,
          verdict: s.verdict,
          findings: s.findings,
        })),
      });
      const expectedPolicy = policy.entries.find((e) => e.id === fixture.id);
      const answered = verdicts.map((v) => v.modifications.verdict);
      if (expectedPolicy) {
        expect(answered).toEqual(expectedPolicy.modifications);
        if (expectedPolicy.policyVersion !== undefined) {
          expect(analysis.policyVersion).toBeGreaterThanOrEqual(expectedPolicy.policyVersion);
        }
      } else {
        // Not yet promoted: no drift from the frozen baseline without an explicit decision.
        const baseline = baselines.get(fixture.id);
        expect(baseline, `baseline for ${fixture.id}`).toBeDefined();
        expect(answered).toEqual(baseline);
      }
    } finally {
      await doc.close();
    }
  });
});

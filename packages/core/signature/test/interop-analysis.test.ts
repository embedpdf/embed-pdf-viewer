/**
 * Interoperability fixtures for the revision analysis: the adversarial
 * probes of `engine/main/test/signature-adversarial.test.ts`, signed with a
 * REAL test certificate so an external validator (pyHanko) can reach its
 * modification analysis. Set `EPDF_INTEROP_DIR=<dir>` to write every
 * fixture, the trust anchor and a manifest of our verdicts there; the
 * scratchpad script `pyh_validate.py` then compares. Skipped otherwise.
 *
 * pyHanko is an interoperability check, not the policy authority: a
 * disagreement is recorded in the manifest's `note`, decided per case.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { Engine } from '@embedpdf/engine-core/runtime';
import { createTestSigner, sign, type TestSigner } from '../src/index';
import { append, pdf, type Objects } from '../../../engine/main/test/helpers/miniPdf';

const OUT = process.env.EPDF_INTEROP_DIR;
const MIB = 1024 * 1024;

type Doc = Awaited<ReturnType<Engine['open']>>;
type Verdict = 'permitted' | 'forbidden' | 'indeterminate' | 'unchanged';

interface Scenario {
  name: string;
  /** Our expected verdict for the step(s) after the first signature. */
  expected: Verdict;
  /** What we expect pyHanko to say, when it is not simply "the same". */
  note?: string;
  build: () => Promise<Uint8Array>;
}

const CATALOG = '/Type /Catalog /Pages 2 0 R /AcroForm 10 0 R';
const sigField = (num: number, name: string, rect: string) =>
  `<< /Type /Annot /Subtype /Widget /FT /Sig /T (${name}) /Rect [${rect}] /P 3 0 R >>`;
const page = (annots: number[]) =>
  `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [${annots.map((n) => `${n} 0 R`).join(' ')}] /Resources <<>> >>`;
const acroForm = (fields: number[]) =>
  `<< /Fields [${fields.map((n) => `${n} 0 R`).join(' ')}] /DA (/Helv 0 Tf 0 g) >>`;
const textField = (v: string, extra = '') =>
  `<< /Type /Annot /Subtype /Widget /FT /Tx /T (text) /V (${v}) /Rect [20 60 180 80] /P 3 0 R${extra} >>`;
const formStream = (content: string) =>
  `<< /Type /XObject /Subtype /Form /BBox [0 0 160 20] /Resources <<>> /Length ${content.length} >>\nstream\n${content}\nendstream`;

function document(objects: Objects, catalogExtra = ''): Uint8Array {
  return pdf({
    1: `<< ${CATALOG}${catalogExtra} >>`,
    2: '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    ...objects,
  });
}

describe.skipIf(!OUT)('interop fixtures for the revision analysis (pyHanko)', () => {
  let engine: Engine;
  let signer: TestSigner;
  let seq = 0;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    signer = await createTestSigner({ commonName: 'EmbedPDF interop signer' });
    await mkdir(OUT!, { recursive: true });
    await writeFile(resolve(OUT!, 'signer.der'), signer.certificate);
  });
  afterAll(async () => {
    await engine.destroy();
  });

  const open = (bytes: Uint8Array): Promise<Doc> =>
    engine.open({ kind: 'bytes', id: `interop-${++seq}`, bytes }, { scope: ['*'] });

  async function certify(
    bytes: Uint8Array,
    permission: 1 | 2 | 3,
    fieldName = 'sig',
  ): Promise<Uint8Array> {
    const doc = await open(bytes);
    try {
      await sign(doc, { field: { kind: 'fqn', name: fieldName }, signer, certify: { permission } });
      return new Uint8Array(await doc.download());
    } finally {
      await doc.close();
    }
  }

  async function ourVerdict(bytes: Uint8Array): Promise<Verdict> {
    const doc = await open(bytes);
    try {
      return (await doc.signatures!.analyze({ since: { signatureIndex: 0 } })).verdict;
    } finally {
      await doc.close();
    }
  }

  const scenarios: Scenario[] = [
    {
      name: 'openaction_alone_p1',
      expected: 'forbidden',
      build: async () => {
        const base = document(
          {
            3: page([30]),
            9: '<< /S /JavaScript /JS (var example = 1;) >>',
            10: acroForm([30]),
            30: sigField(30, 'sig', '10 10 100 40'),
            50: '<< /Certs [] >>',
          },
          ' /OpenAction 9 0 R /DSS 50 0 R',
        );
        return append(await certify(base, 1), { 9: '<< /S /JavaScript /JS (var example = 2;) >>' });
      },
    },
    {
      name: 'openaction_with_dss_p1',
      expected: 'forbidden',
      build: async () => {
        const base = document(
          {
            3: page([30]),
            9: '<< /S /JavaScript /JS (var example = 1;) >>',
            10: acroForm([30]),
            30: sigField(30, 'sig', '10 10 100 40'),
            50: '<< /Certs [] >>',
          },
          ' /OpenAction 9 0 R /DSS 50 0 R',
        );
        return append(await certify(base, 1), {
          9: '<< /S /JavaScript /JS (var example = 2;) >>',
          50: '<< /Certs [] /VRI <<>> >>',
        });
      },
    },
    {
      name: 'fill_unchanged_ap_p2',
      expected: 'permitted',
      build: async () => {
        const base = document({
          3: page([20, 30]),
          10: acroForm([20, 30]),
          20: textField('a', ' /AP 22 0 R'),
          22: '<< /N 23 0 R >>',
          23: formStream('q Q'),
          30: sigField(30, 'sig', '10 10 100 40'),
        });
        return append(await certify(base, 2), {
          20: textField('b', ' /AP 22 0 R'),
          23: formStream('q 0.5 g Q'),
        });
      },
    },
    {
      name: 'appearance_only_p2',
      expected: 'permitted',
      note: 'form filling covers a regenerated appearance under an untouched field (pyHanko: FORM_FILLING)',
      build: async () => {
        const base = document({
          3: page([20, 30]),
          10: acroForm([20, 30]),
          20: textField('a', ' /AP 22 0 R'),
          22: '<< /N 23 0 R >>',
          23: formStream('q Q'),
          30: sigField(30, 'sig', '10 10 100 40'),
        });
        return append(await certify(base, 2), { 23: formStream('q 0.5 g Q') });
      },
    },
    {
      name: 'widget_action_beside_fill_p2',
      expected: 'forbidden',
      build: async () => {
        const base = document({
          3: page([20, 30]),
          10: acroForm([20, 30]),
          20: textField('a', ' /AP << /N 23 0 R >> /A 24 0 R'),
          23: formStream('q Q'),
          24: '<< /S /JavaScript /JS (app.alert(1);) >>',
          30: sigField(30, 'sig', '10 10 100 40'),
        });
        return append(await certify(base, 2), {
          20: textField('b', ' /AP << /N 23 0 R >> /A 24 0 R'),
          23: formStream('q 0.5 g Q'),
          24: '<< /S /JavaScript /JS (app.alert(2);) >>',
        });
      },
    },
    {
      name: 'shared_ap_one_fill_p2',
      expected: 'forbidden',
      build: async () => {
        const other = (v: string) =>
          `<< /Type /Annot /Subtype /Widget /FT /Tx /T (other) /V (${v}) /Rect [20 90 180 110] /P 3 0 R /AP 22 0 R >>`;
        const base = document({
          3: page([20, 40, 30]),
          10: acroForm([20, 40, 30]),
          20: textField('a', ' /AP 22 0 R'),
          22: '<< /N 23 0 R >>',
          23: formStream('q Q'),
          30: sigField(30, 'sig', '10 10 100 40'),
          40: other('x'),
        });
        return append(await certify(base, 2), {
          20: textField('b', ' /AP 22 0 R'),
          23: formStream('q 0.5 g Q'),
        });
      },
    },
    {
      name: 'truncated_catalog_p1',
      expected: 'indeterminate',
      note: 'pyHanko has no inspection cap: it sees the /OpenAction change and reports it as illegitimate',
      build: async () => {
        const base = document(
          {
            3: page([30]),
            9: '<< /S /JavaScript /JS (var example = 1;) >>',
            10: acroForm([30]),
            30: sigField(30, 'sig', '10 10 100 40'),
          },
          ` /OpenAction 9 0 R /Padding (${'x'.repeat(MIB + 100)})`,
        );
        const signed = await certify(base, 1);
        const text = Buffer.from(signed).toString('latin1');
        const root = [...text.matchAll(/(?:^|[\r\n])1 0 obj\s*([\s\S]*?)endobj/g)].at(-1)![1];
        return append(signed, {
          1: root.replace(
            /\/OpenAction\s*9 0 R/,
            '/OpenAction << /S /JavaScript /JS (var example = 2;) >>',
          ),
        });
      },
    },
    {
      name: 'second_signature_with_lock_and_appearance_p2',
      expected: 'permitted',
      build: async () => {
        const base = document({
          3: page([20, 30, 31]),
          10: acroForm([20, 30, 31]),
          20: textField('a'),
          30: sigField(30, 'sig', '10 10 100 40'),
          31: sigField(31, 'sig2', '110 10 200 40'),
        });
        const certified = await certify(base, 2);
        const doc = await open(certified);
        try {
          await sign(doc, {
            field: { kind: 'fqn', name: 'sig2' },
            signer,
            lock: { action: 'include', fields: ['text'] },
          });
          return new Uint8Array(await doc.download());
        } finally {
          await doc.close();
        }
      },
    },
    {
      name: 'certify_then_fill_layer_p2',
      expected: 'permitted',
      build: async () => {
        const base = document({
          3: page([20, 30]),
          10: acroForm([20, 30]),
          20: textField('a'),
          30: sigField(30, 'sig', '10 10 100 40'),
        });
        const certified = await certify(base, 2);
        const doc = await open(certified);
        try {
          await doc.forms.setValue(
            { kind: 'fqn', name: 'text' },
            { type: 'text', value: 'filled' },
          );
          return new Uint8Array(await doc.download());
        } finally {
          await doc.close();
        }
      },
    },
    {
      // Certified by us; pyHanko adds and signs a new field in ONE revision (its default flow).
      // The scratchpad script `pyh_sign_new_field.py` completes this one; here we only write the input.
      name: 'certified_p2_input_for_pyhanko_new_field',
      expected: 'unchanged',
      note: 'input only: pyh_sign_new_field.py appends a VISIBLE signed field in one revision; we judge the output permitted (ISO 32000-2 P=2 lists signing; Acrobat agrees). pyHanko refuses it under its default allow_new_visible_after_certify=False, a policy stricter than the standard.',
      build: async () =>
        certify(
          document({ 3: page([30]), 10: acroForm([30]), 30: sigField(30, 'sig', '10 10 100 40') }),
          2,
        ),
    },
  ];

  // `EPDF_INTEROP_ANALYZE=<pdf>`: print our analysis of a file produced elsewhere (e.g. by pyHanko).
  test.skipIf(!process.env.EPDF_INTEROP_ANALYZE)('analyze an external file', async () => {
    const { readFile } = await import('node:fs/promises');
    const doc = await open(new Uint8Array(await readFile(process.env.EPDF_INTEROP_ANALYZE!)));
    try {
      const a = await doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      console.log(
        JSON.stringify({
          verdict: a.verdict,
          steps: a.steps.map((s) => ({
            level: s.levelInForce,
            verdict: s.verdict,
            objects: s.changes.map((c) => c.objectNumber),
            findings: s.findings,
          })),
        }),
      );
    } finally {
      await doc.close();
    }
  });

  // `EPDF_INTEROP_NATIVE=1`: a file-backed session on the native runtime signs
  // through a file candidate (C2–C4); the sealed FILE is what pyHanko checks.
  test.skipIf(!process.env.EPDF_INTEROP_NATIVE)(
    'file-backed signing on the native runtime',
    async () => {
      const { copyFile, readFile } = await import('node:fs/promises');
      const native = createLocalEngine({ runtime: { prefer: 'native' } });
      try {
        const basePath = resolve(OUT!, 'native_base.pdf');
        await writeFile(
          basePath,
          document({
            3: '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Annots [20 0 R 30 0 R] /Resources <<>> >>',
            10: '<< /Fields [20 0 R 30 0 R] /DA (/Helv 0 Tf 0 g) >>',
            20: '<< /Type /Annot /Subtype /Widget /FT /Tx /T (text) /V (a) /Rect [20 60 180 80] /P 3 0 R >>',
            30: '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig) /Rect [10 10 100 40] /P 3 0 R >>',
          }),
        );
        const doc = await native.open(
          { kind: 'layerFile', id: 'native-file', basePath },
          { scope: ['*'] },
        );
        let sealedPath: string;
        try {
          await doc.forms.setValue(
            { kind: 'fqn', name: 'text' },
            { type: 'text', value: 'filled on disk' },
          );
          const result = await sign(doc, {
            field: { kind: 'fqn', name: 'sig' },
            signer,
            certify: { permission: 2 },
          });
          expect(result.status).toBe('completed');
          // The session's base is now the sealed candidate file beside the base.
          const { readdir } = await import('node:fs/promises');
          const files = (await readdir(OUT!)).filter((f) =>
            f.startsWith('native_base.pdf.signing-'),
          );
          expect(files).toHaveLength(1);
          sealedPath = resolve(OUT!, files[0]);
          const downloaded = new Uint8Array(await doc.download());
          expect(Buffer.compare(Buffer.from(downloaded), await readFile(sealedPath))).toBe(0);
        } finally {
          await doc.close();
        }
        await copyFile(sealedPath, resolve(OUT!, 'native_file_signed_p2.pdf'));
      } finally {
        await native.destroy();
      }
    },
  );

  test('write fixtures and manifest', async () => {
    const manifest: Array<{ name: string; expected: Verdict; ours: Verdict; note?: string }> = [];
    for (const s of scenarios) {
      const bytes = await s.build();
      await writeFile(resolve(OUT!, `${s.name}.pdf`), bytes);
      const ours = await ourVerdict(bytes);
      manifest.push({
        name: s.name,
        expected: s.expected,
        ours,
        ...(s.note ? { note: s.note } : {}),
      });
      expect(ours, s.name).toBe(s.expected);
    }
    await writeFile(resolve(OUT!, 'manifest.json'), JSON.stringify(manifest, null, 2));
  });
});

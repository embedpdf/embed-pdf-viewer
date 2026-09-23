/**
 * B4: signature read/analysis cost on a large multi-revision document.
 * Env-gated (`EPDF_SIG_BENCH=1`); prints a table, asserts nothing but
 * sanity. Sizes: `EPDF_SIG_BENCH_MB` (image bytes, default 50),
 * `EPDF_SIG_BENCH_REVS` (fill revisions after the certification, default
 * 12), `EPDF_SIG_BENCH_FIELDS` (text fields, default 400).
 */
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '../src/index';
import { append, latin1, pdf, type Objects } from './helpers/miniPdf';

const ENABLED = !!process.env.EPDF_SIG_BENCH;
const MB = Number(process.env.EPDF_SIG_BENCH_MB ?? 50);
const REVS = Number(process.env.EPDF_SIG_BENCH_REVS ?? 12);
const FIELDS = Number(process.env.EPDF_SIG_BENCH_FIELDS ?? 400);
const PAGES = 8;
const FAKE_CMS = new Uint8Array([0x30, 3, 2, 1, 1]);

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
type Doc = Awaited<ReturnType<Engine['open']>>;

async function timed<T>(label: string, rows: string[], fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  rows.push(`${label.padEnd(44)} ${(performance.now() - t0).toFixed(1).padStart(9)} ms`);
  return out;
}

/** Catalog 1, pages 2, pages 3..3+pages, images after, AcroForm 10, fields after. */
function buildDocument(): Uint8Array {
  const objects: Objects = {};
  const pageNums = Array.from({ length: PAGES }, (_, i) => 100 + i);
  const imageNums = Array.from({ length: PAGES }, (_, i) => 200 + i);
  const fieldNums = Array.from({ length: FIELDS }, (_, i) => 1000 + i);
  const sigNum = 999;
  objects[1] = '<< /Type /Catalog /Pages 2 0 R /AcroForm 10 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${PAGES} >>`;
  objects[10] = `<< /Fields [${[...fieldNums, sigNum].map((n) => `${n} 0 R`).join(' ')}] /DA (/Helv 0 Tf 0 g) >>`;
  const perPage = Math.ceil((MB * 1024 * 1024) / PAGES);
  for (let p = 0; p < PAGES; p++) {
    const annots = fieldNums.filter((_, i) => i % PAGES === p);
    if (p === 0) annots.push(sigNum);
    objects[pageNums[p]] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /XObject << /Im ${imageNums[p]} 0 R >> >> ` +
      `/Annots [${annots.map((n) => `${n} 0 R`).join(' ')}] >>`;
    const data = latin1(randomBytes(perPage));
    objects[imageNums[p]] =
      `<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length ${data.length} >>\nstream\n${data}\nendstream`;
  }
  fieldNums.forEach((n, i) => {
    objects[n] = `<< /Type /Annot /Subtype /Widget /FT /Tx /T (f${i}) /V (v${i}) /Rect [20 ${20 + (i % 30) * 20} 180 ${35 + (i % 30) * 20}] /P ${pageNums[i % PAGES]} 0 R >>`;
  });
  objects[sigNum] = '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig) /Rect [300 10 500 60] /P 100 0 R >>';
  return pdf(objects);
}

describe.skipIf(!ENABLED)('signature analysis cost on a large multi-revision document', () => {
  let engine: Engine;
  let plainEngine: Engine;
  let signed: Uint8Array;
  const rows: string[] = [];

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    plainEngine = await createLocalEngine({ runtime: { prefer: 'wasm' }, sessionKind: 'plain' });
    const base = await timed(`build ${MB} MB, ${FIELDS} fields`, rows, async () => buildDocument());
    const doc = await engine.open({ kind: 'bytes', id: 'bench-base', bytes: base }, { scope: ['*'] });
    try {
      const prepared = await timed('prepare (certify P=2)', rows, () =>
        doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 } }),
      );
      await timed('complete', rows, () =>
        doc.signatures!.complete({ signingId: prepared.signingId, expectedVersion: prepared.expectedVersion, cms: FAKE_CMS }),
      );
      signed = new Uint8Array(await doc.download());
    } finally {
      await doc.close();
    }
    // Revs fill revisions after the certification, each rewriting one field.
    for (let r = 0; r < REVS; r++) {
      const i = r % FIELDS;
      signed = append(signed, {
        [1000 + i]: `<< /Type /Annot /Subtype /Widget /FT /Tx /T (f${i}) /V (rev${r}) /Rect [20 ${20 + (i % 30) * 20} 180 ${35 + (i % 30) * 20}] /P ${100 + (i % PAGES)} 0 R >>`,
      });
    }
    rows.push(`bytes ${(signed.byteLength / 1048576).toFixed(1)} MB, revisions ${REVS + 2}`);
  }, 600_000);

  afterAll(async () => {
    console.log(['', ...rows, ''].join('\n'));
    await engine.destroy();
    await plainEngine.destroy();
  });

  async function measure(label: string, eng: Engine): Promise<void> {
    const doc: Doc = await timed(`${label} open`, rows, () => eng.open({ kind: 'bytes', id: `bench-${label}`, bytes: signed }, { scope: ['*'] }));
    try {
      const snapshot = await timed(`${label} list() first`, rows, () => doc.signatures!.list());
      await timed(`${label} list() again`, rows, () => doc.signatures!.list());
      await timed(`${label} version()`, rows, () => doc.version!());
      await timed(`${label} version() again`, rows, () => doc.version!());
      const all = await timed(`${label} analyze all ${REVS} steps`, rows, () => doc.signatures!.analyze({ since: { signatureIndex: 0 } }));
      expect(all.verdict).toBe('permitted');
      const last = snapshot.revisions.length - 1;
      await timed(`${label} analyze last step`, rows, () => doc.signatures!.analyze({ since: { revisionIndex: last - 1 }, until: { revisionIndex: last } }));
      await timed(`${label} download (no edits, verbatim)`, rows, () => doc.download());
      await doc.forms.setValue({ kind: 'fqn', name: 'f3' }, { type: 'text', value: 'unsaved' });
      const working = await timed(`${label} analyze working-copy (1 unsaved edit)`, rows, () => doc.signatures!.analyze({ since: { signatureIndex: 0 }, until: 'working-copy' }));
      expect(working.verdict).toBe('permitted');
      const prepared = await timed(`${label} prepare (2nd sig, unsaved edit)`, rows, () => doc.signatures!.prepare({ field: { kind: 'fqn', name: 'sig' } }).catch(() => null));
      if (prepared) await doc.signatures!.abort(prepared.signingId);
    } finally {
      await doc.close();
    }
  }

  test('layer session', async () => {
    await measure('layer', engine);
  }, 600_000);

  test('plain session', async () => {
    await measure('plain', plainEngine);
  }, 600_000);
});

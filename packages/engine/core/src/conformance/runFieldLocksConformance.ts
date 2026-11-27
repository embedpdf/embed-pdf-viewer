/**
 * A field a signed signature locked, read and answered the same on every
 * engine:
 *   - a field read names the signature whose lock covers it
 *     (`FormField.lockedBy`), whether or not the field is marked read-only:
 *     another producer's lock may leave the bit off;
 *   - `doc.security.allowsField()` answers as the write does: a fill of a
 *     locked field is refused under `signedDocumentPolicy: 'protect'`, a
 *     signing of a locked signature field under any policy;
 *   - after a signing in the same session, both follow its lock, also for a
 *     field read before it.
 *
 * It runs on {@link FIELD_LOCKS_PDF}.
 */
import { pdfOf, sealedPdfOf, SIGNATURE_SLOT } from './pdfOf';
import type { ConformanceTestRunner } from './runMetadataConformance';
import type { Identity } from '../auth/scope/types';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormFieldRef } from '../identity/FormFieldRef';
import type { FieldLockSpec, FieldSignatureLock } from '../signature/types';

/** A DER `SEQUENCE`: what a completion takes as a CMS, without judging it. */
const PLACEHOLDER_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

/**
 * One page whose signature `signed` (object 4, its value 8) seals the file
 * and locks `text` (5) and `open_sig` (7), by its FieldMDP and by its own
 * `/Lock`, as another producer may leave it: neither field is marked
 * read-only. `free` (6) and `free_sig` (9) are locked by nothing.
 */
export const FIELD_LOCKS_PDF = (() => {
  const locked = '[(text) (open_sig)]';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R 6 0 R 7 0 R 9 0 R] ' +
      '/SigFlags 3 /DA (/Helv 10 Tf 0 g) /DR << /Font << /Helv << /Type /Font /Subtype /Type1 ' +
      '/BaseFont /Helvetica >> >> >> >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 10 0 R /Resources << >> ' +
      '/Annots [4 0 R 5 0 R 6 0 R 7 0 R 9 0 R] >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (signed) /Rect [20 20 140 60] /F 4 /P 3 0 R ' +
      `/V 8 0 R /Lock << /Type /SigFieldLock /Action /Include /Fields ${locked} >> >>`,
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (text) /Rect [20 340 180 360] /F 4 /P 3 0 R >>',
    '<< /Type /Annot /Subtype /Widget /FT /Tx /T (free) /Rect [200 340 380 360] /F 4 /P 3 0 R >>',
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (open_sig) /Rect [160 20 280 60] /F 4 /P 3 0 R >>',
    '<< /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ' +
      '/Reference [<< /Type /SigRef /TransformMethod /FieldMDP /TransformParams ' +
      `<< /Type /TransformParams /Action /Include /Fields ${locked} /V /1.2 >> >>] ` +
      `${SIGNATURE_SLOT} >>`,
    '<< /Type /Annot /Subtype /Widget /FT /Sig /T (free_sig) /Rect [290 20 390 60] /F 4 /P 3 0 R >>',
    '<< /Length 0 >>\nstream\n\nendstream',
  ];
  return sealedPdfOf(objects, PLACEHOLDER_CMS);
})();

/** The same page, unsigned: nothing locks anything. */
const UNSIGNED_PDF = pdfOf([
  '<< /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R 5 0 R] /DA (/Helv 10 Tf 0 g) ' +
    '/DR << /Font << /Helv << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> >> >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 400] /Contents 6 0 R /Resources << >> ' +
    '/Annots [4 0 R 5 0 R] >>',
  '<< /Type /Annot /Subtype /Widget /FT /Tx /T (text) /Rect [20 340 180 360] /F 4 /P 3 0 R >>',
  '<< /Type /Annot /Subtype /Widget /FT /Sig /T (sig) /Rect [20 20 140 60] /F 4 /P 3 0 R >>',
  '<< /Length 0 >>\nstream\n\nendstream',
]);

/** What a signing in this suite names: the field, and a lock of its own. */
export interface FieldLocksSigning {
  field: FormFieldRef;
  lock?: FieldLockSpec;
}

export interface FieldLocksConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /** Open a fresh copy of `bytes` with `scope`, acting for `identity`. */
  open: (
    engine: Engine,
    scope: readonly string[],
    identity: Identity,
    bytes: Uint8Array,
  ) => Promise<DocumentHandle>;
  /**
   * Sign and complete `signing` on `doc`. Left out: prepare, then complete
   * with a placeholder CMS, which an engine that judges the CMS refuses.
   */
  sign?: (doc: DocumentHandle, signing: FieldLocksSigning) => Promise<void>;
  /**
   * An engine whose documents' signatures are judged but not enforced
   * (`signedDocumentPolicy: 'permit'`). Left out where the engine has no
   * such policy.
   */
  makePermitEngine?: () => Promise<Engine> | Engine;
}

const field = (name: string): FormFieldRef => ({ kind: 'fqn', name });
const BY_THE_SEAL: FieldSignatureLock = { signatureIndex: 0, source: 'fieldmdp' };

export function runFieldLocksConformance(
  runner: ConformanceTestRunner,
  options: FieldLocksConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`field locks conformance: ${options.label}`, () => {
    let engine: Engine;
    let permitEngine: Engine | null = null;

    beforeAll(async () => {
      engine = await options.makeEngine();
      if (options.makePermitEngine) permitEngine = await options.makePermitEngine();
    });

    afterAll(async () => {
      await engine?.destroy();
      await permitEngine?.destroy();
    });

    const withDoc = async (
      bytes: Uint8Array,
      run: (doc: DocumentHandle) => Promise<void>,
      on: Engine = engine,
    ) => {
      const doc = await options.open(on, ['*'], {}, bytes);
      try {
        await run(doc);
      } finally {
        await doc.close();
      }
    };

    const sign = async (doc: DocumentHandle, signing: FieldLocksSigning) => {
      if (options.sign) return options.sign(doc, signing);
      const prepared = await doc.signatures.prepare(signing);
      await doc.signatures.complete({
        signingId: prepared.signingId,
        cms: PLACEHOLDER_CMS,
        expectedVersion: prepared.expectedVersion,
      });
    };

    /** `'resolved'`, or the code a refused `attempt` failed with. */
    const outcome = (attempt: Promise<unknown>): Promise<string> =>
      attempt.then(
        () => 'resolved',
        (error: unknown) => (EngineError.is(error) ? error.code : String(error)),
      );

    test('a field read names the signature that locked it, read-only or not', async () => {
      await withDoc(FIELD_LOCKS_PDF, async (doc) => {
        const { fields } = await doc.forms.list();
        const read = Object.fromEntries(fields.map((f) => [f.name, [f.readOnly, f.lockedBy]]));
        expect(read).toEqual({
          signed: [false, null],
          text: [false, BY_THE_SEAL],
          free: [false, null],
          open_sig: [false, BY_THE_SEAL],
          free_sig: [false, null],
        });
        // One field read alone says the same.
        expect((await doc.forms.get(field('text'))).lockedBy).toEqual(BY_THE_SEAL);
      });
    });

    test('the fill and sign checks answer as the write does', async () => {
      await withDoc(FIELD_LOCKS_PDF, async (doc) => {
        const text = await doc.forms.get(field('text'));
        const free = await doc.forms.get(field('free'));
        const openSig = await doc.forms.get(field('open_sig'));
        expect(doc.security.allowsField('fill', text)).toBe(false);
        expect(doc.security.allowsField('fill', free)).toBe(true);
        expect(doc.security.allowsField('sign', openSig)).toBe(false);
        expect(doc.security.allowsField('sign', await doc.forms.get(field('free_sig')))).toBe(true);
        expect(await outcome(doc.forms.setValue(text.ref, { value: 'x' }))).toBe(
          EngineErrorCode.ProtectedDocument,
        );
        expect(await outcome(doc.forms.setValue(free.ref, { value: 'x' }))).toBe('resolved');
        expect(await outcome(sign(doc, { field: openSig.ref }))).toBe(
          EngineErrorCode.SignatureRefused,
        );
        // A target with a group and no name names no field, so no lock reaches it.
        expect(doc.security.allowsField('fill', { groupId: null })).toBe(true);
      });
    });

    test('after a signing, the read and the checks follow its lock', async () => {
      await withDoc(UNSIGNED_PDF, async (doc) => {
        const before = await doc.forms.get(field('text'));
        expect(before.lockedBy).toBe(null);
        expect(doc.security.allowsField('fill', before)).toBe(true);
        await sign(doc, { field: field('sig'), lock: { action: 'include', fields: ['text'] } });
        const after = await doc.forms.get(field('text'));
        expect(after.lockedBy).toEqual({ signatureIndex: 0, source: 'fieldmdp' });
        // Our signing marks the field read-only too; the check needs no new read.
        expect(after.readOnly).toBe(true);
        expect(doc.security.allowsField('fill', before)).toBe(false);
        expect(doc.security.allowsField('fill', after)).toBe(false);
        expect(await outcome(doc.forms.setValue(after.ref, { value: 'x' }))).toBe(
          EngineErrorCode.ProtectedDocument,
        );
      });
    });

    test('where signatures are judged but not enforced, a fill goes through and a signing does not', async () => {
      if (!permitEngine) return;
      await withDoc(
        FIELD_LOCKS_PDF,
        async (doc) => {
          const text = await doc.forms.get(field('text'));
          const openSig = await doc.forms.get(field('open_sig'));
          // The read still names the lock: a validator judges a change to the field.
          expect(text.lockedBy).toEqual(BY_THE_SEAL);
          expect(doc.security.allowsField('fill', text)).toBe(true);
          expect(await outcome(doc.forms.setValue(text.ref, { value: 'x' }))).toBe('resolved');
          expect(doc.security.allowsField('sign', openSig)).toBe(false);
          expect(await outcome(sign(doc, { field: openSig.ref }))).toBe(
            EngineErrorCode.SignatureRefused,
          );
        },
        permitEngine,
      );
    });
  });
}

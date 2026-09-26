import type { ConformanceFixture, ConformanceTestRunner } from './runMetadataConformance';
import type { DocumentHandle } from '../engine/DocumentHandle';
import type { Engine } from '../engine/Engine';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

export interface SignatureConformanceFixtures {
  /** A form with no signature fields at all. */
  unsignedForm: ConformanceFixture;
  /**
   * Three revisions: the original, an approval signature sealing revision
   * 1, and a form fill plus a second approval signature sealing revision
   * 2. Both signatures have whole-revision coverage; `textField` is the
   * filled text field.
   */
  twoApprovals: ConformanceFixture & { fieldNames: [string, string]; textField: string };
  /** Two revisions: a certification signature with permission 2 sealing revision 1. */
  certified: ConformanceFixture & { fieldName: string };
  /** Two revisions: one approval signature whose FieldMDP includes `lockedField`. */
  fieldMdp: ConformanceFixture & { fieldName: string; lockedField: string };
  /** Three chained revisions, two signatures whose ranges are well-formed but seal no revision. */
  partialChain: ConformanceFixture;
  /** One unsigned signature field (with a widget) and one text field, nothing signed. */
  unsignedSigField: ConformanceFixture & { fieldName: string; textField: string };
  /** Any single-page PDF, used as signature artwork. */
  artwork: ConformanceFixture;
}

export interface SignatureConformanceOptions {
  label: string;
  makeEngine: () => Promise<Engine> | Engine;
  /**
   * An engine constructed with `signedDocumentPolicy: 'permit'`; the
   * suite proves the protection it lifts. Omit where the engine has no
   * such option.
   */
  makePermitEngine?: () => Promise<Engine> | Engine;
  /** `layerBytes` opens each fixture as an immutable base with a fresh layer on top. */
  openKind: 'bytes' | 'layerBytes' | 'id';
  fixtures: SignatureConformanceFixtures;
}

/**
 * Digital signatures, read side. The service is OPTIONAL on the contract
 * (`downloadLayer?` pattern) — the suite runs only where the engine
 * provides it.
 *
 * Invariants:
 *   1. Byte facts describe the LOADED bytes: a revision is a byte prefix,
 *      a whole-revision signature seals exactly one, the digest over its
 *      `/ByteRange` is what the file's bytes hash to, and an unsaved edit
 *      changes none of it.
 *   2. Protection is derived from the signatures in the file and applied
 *      as document-derived capabilities: a certification with permission 2
 *      takes page assembly and annotation writes away, a FieldMDP freezes
 *      the fields it names, a rewrite save is refused. Under
 *      `signedDocumentPolicy: 'permit'` none of that applies and the
 *      analysis is unchanged.
 *   3. The same answers come from a plain session and from a layer
 *      session over the same bytes.
 */
export function runSignatureConformance(
  runner: ConformanceTestRunner,
  opts: SignatureConformanceOptions,
): void {
  const { describe, test, beforeAll, afterAll, expect } = runner;

  describe(`signatures conformance: ${opts.label}`, () => {
    let engine: Engine;
    let permitEngine: Engine | null = null;
    let supported = false;

    beforeAll(async () => {
      engine = await opts.makeEngine();
      const probe = await open(engine, opts, opts.fixtures.unsignedForm);
      supported = probe.signatures !== undefined;
      await probe.close();
      if (supported && opts.makePermitEngine) permitEngine = await opts.makePermitEngine();
    });

    afterAll(async () => {
      if (permitEngine) await permitEngine.destroy();
      if (engine) await engine.destroy();
    });

    test('an unsigned form has no signatures and no protection; version() hashes the loaded bytes', async () => {
      if (!supported) return;
      const bytes = await opts.fixtures.unsignedForm.bytes();
      const doc = await open(engine, opts, opts.fixtures.unsignedForm);
      try {
        const snapshot = await doc.signatures!.list();
        expect(snapshot.chainValid).toBe(true);
        expect(snapshot.signatures).toEqual([]);
        expect(snapshot.revisions.length >= 1).toBe(true);
        expect(snapshot.protection.judged).toBeNull();
        expect(snapshot.protection.enforced).toBeNull();
        expect(snapshot.protection.certification).toBeNull();
        expect(snapshot.protection.fieldLocks).toEqual([]);
        expect(doc.security.allows('doc.pages.assemble')).toBe(true);
        if (doc.version) {
          const version = await doc.version();
          expect(version.byteLength).toBe(bytes.byteLength);
          expect(version.sha256).toBe(await sha256Hex(bytes));
        }
        let caught: unknown;
        try {
          await doc.signatures!.contents({ kind: 'fqn', name: 'no-such-field' });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    test('two approval signatures: revisions, coverage, digests, contents, revision bytes', async () => {
      if (!supported) return;
      const fixture = opts.fixtures.twoApprovals;
      const bytes = await fixture.bytes();
      const doc = await open(engine, opts, fixture);
      try {
        const snapshot = await doc.signatures!.list();
        expect(snapshot.chainValid).toBe(true);
        expect(snapshot.revisions).toHaveLength(3);
        expect(snapshot.signatures).toHaveLength(2);
        expect(snapshot.revisions[2].end).toBe(bytes.byteLength);
        for (const [i, sig] of snapshot.signatures.entries()) {
          expect(sig.index).toBe(i);
          expect(sig.signed).toBe(true);
          expect(sig.kind).toBe('signature');
          expect(sig.field.kind).toBe('objectNumber');
          expect(sig.fieldName).toBe(fixture.fieldNames[i]);
          expect(sig.coverage).toBe('whole-revision');
          expect(sig.revisionIndex).toBe(i + 1);
          expect(snapshot.revisions[i + 1].signatureIndex).toBe(i);
          expect(sig.subFilter).toBe('ETSI.CAdES.detached');
          expect(typeof sig.signer.claimedTime).toBe('string');
          expect(sig.docMdp).toBeNull();
          expect(sig.catalogCertification).toBe(false);
          expect(sig.contentsSize > 0).toBe(true);
          expect(sig.byteRange![0]).toBe(0);
          expect(sig.byteRange![2] + sig.byteRange![3]).toBe(snapshot.revisions[i + 1].end);
        }
        // Approval signatures without a certification: nothing declared, judged at the baseline.
        expect(snapshot.protection.judged).toBe('annotate');
        expect(snapshot.protection.enforced).toBeNull();
        expect(snapshot.protection.certification).toBeNull();
        expect(snapshot.protection.fieldLocks).toEqual([]);

        // The DER object, exactly as long as its TLV declares.
        const first = snapshot.signatures[0];
        const contents = await doc.signatures!.contents(first.field);
        expect(contents.byteLength).toBe(first.contentsSize);
        expect(contents[0]).toBe(0x30);

        // The digest is what the file's own bytes hash to over the range.
        const [a, b, c, d] = first.byteRange!;
        const sealed = await doc.signatures!.revisionBytes(1);
        expect(sealed.byteLength).toBe(snapshot.revisions[1].end);
        expect(bytesEqual(sealed, bytes.subarray(0, sealed.byteLength))).toBe(true);
        const signedBytes = concat(sealed.subarray(a, a + b), sealed.subarray(c, c + d));
        const digest = await doc.signatures!.digest(first.field, 'sha256');
        expect(digest.byteLength).toBe(32);
        expect(toHex(digest)).toBe(await sha256Hex(signedBytes));
        // Any algorithm, same protocol.
        expect((await doc.signatures!.digest(first.field, 'sha512')).byteLength).toBe(64);
        // fqn refs resolve too.
        const byName = await doc.signatures!.digest(
          { kind: 'fqn', name: first.fieldName },
          'sha256',
        );
        expect(toHex(byName)).toBe(toHex(digest));

        // An unsaved edit is not a revision: the byte facts do not move.
        const fields = await doc.forms.list();
        const text = fields.fields.find((f) => f.name === fixture.textField)!;
        expect(text).toBeTruthy();
        await doc.forms.setValue(
          { kind: 'objectNumber', fieldObjectNumber: text.fieldObjectNumber },
          {
            type: 'text',
            value: 'unsaved',
          },
        );
        const again = await doc.signatures!.list();
        expect(again.revisions).toEqual(snapshot.revisions);
        expect(again.signatures.map((s) => [s.coverage, s.revisionIndex, s.byteRange])).toEqual(
          snapshot.signatures.map((s) => [s.coverage, s.revisionIndex, s.byteRange]),
        );
        expect(toHex(await doc.signatures!.digest(first.field, 'sha256'))).toBe(toHex(digest));
        if (doc.version) {
          expect((await doc.version()).sha256).toBe(await sha256Hex(bytes));
        }
      } finally {
        await doc.close();
      }
    });

    test('a certification takes structural capabilities away; permit lifts it', async () => {
      if (!supported) return;
      const fixture = opts.fixtures.certified;
      const doc = await open(engine, opts, fixture);
      try {
        const snapshot = await doc.signatures!.list();
        const signed = snapshot.signatures.filter((s) => s.signed);
        expect(signed).toHaveLength(1);
        const sig = signed[0];
        expect(sig.fieldName).toBe(fixture.fieldName);
        expect(sig.coverage).toBe('whole-revision');
        expect(sig.docMdp).toBe(2);
        expect(sig.catalogCertification).toBe(true);
        expect(snapshot.protection.judged).toBe('fill');
        expect(snapshot.protection.enforced).toBe('fill');
        expect(snapshot.protection.certification).toEqual({
          signatureIndex: sig.index,
          permission: 2,
        });

        expect(doc.security.allows('doc.forms.read')).toBe(true);
        expect(doc.security.allows('doc.forms.fill')).toBe(true);
        expect(doc.security.allows('doc.annotate.modify')).toBe(false);
        expect(doc.security.allows('doc.pages.assemble')).toBe(false);
        expect(doc.security.allows('doc.redact')).toBe(false);

        const list = await doc.pages.list();
        let caught: unknown;
        try {
          await doc.pages.delete([list.pages[0].ref]);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.ProtectedDocument)).toBe(true);

        caught = undefined;
        try {
          await doc.download({ mode: 'rewrite' });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.ProtectedDocument)).toBe(true);
        // An incremental save keeps the signature; the read side agrees.
        const saved = await doc.download();
        expect(saved.byteLength >= snapshot.revisions[1].end).toBe(true);
      } finally {
        await doc.close();
      }

      if (!permitEngine) return;
      const permitted = await open(permitEngine, opts, fixture);
      try {
        // Analysis is policy-independent; enforcement is not.
        const snapshot = await permitted.signatures!.list();
        expect(snapshot.protection.judged).toBe('fill');
        expect(snapshot.protection.enforced).toBe('fill');
        expect(permitted.security.allows('doc.pages.assemble')).toBe(true);
        const rewritten = await permitted.download({ mode: 'rewrite' });
        expect(rewritten.byteLength > 0).toBe(true);
      } finally {
        await permitted.close();
      }
    });

    test('a FieldMDP freezes the fields it names; permit lifts it', async () => {
      if (!supported) return;
      const fixture = opts.fixtures.fieldMdp;
      const doc = await open(engine, opts, fixture);
      const lockedRef = { kind: 'fqn', name: fixture.lockedField } as const;
      try {
        const snapshot = await doc.signatures!.list();
        const sig = snapshot.signatures[0];
        expect(sig.fieldName).toBe(fixture.fieldName);
        expect(sig.fieldMdp).toEqual({ action: 'include', fields: [fixture.lockedField] });
        expect(snapshot.protection.judged).toBe('annotate');
        expect(snapshot.protection.enforced).toBeNull();
        // The FieldMDP, and the /Lock the authoring engine mirrors it with
        // when it wrote the field — both name the same fields.
        expect(snapshot.protection.fieldLocks[0]).toEqual({
          signatureIndex: 0,
          source: 'fieldmdp',
          spec: { action: 'include', fields: [fixture.lockedField] },
        });
        for (const lock of snapshot.protection.fieldLocks) {
          expect(lock.signatureIndex).toBe(0);
          expect(lock.spec).toEqual({ action: 'include', fields: [fixture.lockedField] });
        }
        // Filling in general is still allowed; THIS field is not.
        expect(doc.security.allows('doc.forms.fill')).toBe(true);
        let caught: unknown;
        try {
          await doc.forms.setValue(lockedRef, { type: 'text', value: 'changed' });
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.ProtectedDocument)).toBe(true);
        const field = await doc.forms.get(lockedRef);
        expect(field.family).toBe('text');
        expect((field as { value?: string }).value === 'changed').toBe(false);
      } finally {
        await doc.close();
      }

      if (!permitEngine) return;
      const permitted = await open(permitEngine, opts, fixture);
      try {
        const result = await permitted.forms.setValue(lockedRef, {
          type: 'text',
          value: 'changed',
        });
        expect(result.field.name).toBe(fixture.lockedField);
      } finally {
        await permitted.close();
      }
    });

    test('well-formed ranges that seal no revision are partial, with no revision index', async () => {
      if (!supported) return;
      const doc = await open(engine, opts, opts.fixtures.partialChain);
      try {
        const snapshot = await doc.signatures!.list();
        expect(snapshot.chainValid).toBe(true);
        expect(snapshot.revisions).toHaveLength(3);
        expect(snapshot.signatures).toHaveLength(2);
        for (const sig of snapshot.signatures) {
          expect(sig.signed).toBe(true);
          expect(sig.coverage).toBe('partial');
          expect(sig.revisionIndex).toBeNull();
          expect(sig.contentsSize).toBe(13);
          expect((await doc.signatures!.contents(sig.field)).byteLength).toBe(13);
          expect((await doc.signatures!.digest(sig.field, 'sha256')).byteLength).toBe(32);
        }
        expect(snapshot.revisions.every((r) => r.signatureIndex === null)).toBe(true);
        // Signed, so judged at the approval baseline — even a partial one is a signature.
        expect(snapshot.protection.judged).toBe('annotate');
        expect(snapshot.protection.enforced).toBeNull();
        let caught: unknown;
        try {
          await doc.signatures!.revisionBytes(3);
        } catch (err) {
          caught = err;
        }
        expect(EngineError.is(caught, EngineErrorCode.NotFound)).toBe(true);
      } finally {
        await doc.close();
      }
    });

    if (opts.openKind !== 'id') {
      runSigningTests(
        runner,
        opts,
        () => engine,
        () => supported,
      );
      runAnalysisTests(
        runner,
        opts,
        () => engine,
        () => permitEngine,
        () => supported,
      );
    }
  });
}

function runAnalysisTests(
  runner: ConformanceTestRunner,
  opts: SignatureConformanceOptions,
  engineOf: () => Engine,
  permitEngineOf: () => Engine | null,
  supported: () => boolean,
): void {
  const { test, expect } = runner;

  test('analyze: a form fill and a second signature after an approval are permitted', async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, opts.fixtures.twoApprovals);
    try {
      const analysis = await doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.mode).toBe('authoritative');
      expect(analysis.basis.source).toBe('persisted');
      expect(analysis.since).toEqual({ revisionIndex: 1, signatureIndex: 0 });
      expect(analysis.until.revisionIndex).toBe(2);
      expect(analysis.steps).toHaveLength(1);
      const [step] = analysis.steps;
      expect(step.levelInForce).toBe('annotate');
      expect(step.verdict).toBe('permitted');
      expect(step.changes.length > 0).toBe(true);
      const rules = new Set(
        step.findings.filter((f) => f.verdict === 'permitted').map((f) => f.rule),
      );
      expect(rules.has('form-fill')).toBe(true);
      expect(rules.has('signature-added')).toBe(true);
      expect(step.findings.filter((f) => f.verdict === 'forbidden')).toEqual([]);
      expect(analysis.verdict).toBe('permitted');
      // The last signature has nothing after it.
      const latest = await doc.signatures!.analyze({ since: { signatureIndex: 1 } });
      expect(latest.steps).toHaveLength(0);
      expect(latest.verdict).toBe('unchanged');
      // History only: from the original revision up to the first signature.
      const historic = await doc.signatures!.analyze({
        since: { revisionIndex: 0 },
        until: { revisionIndex: 1 },
      });
      expect(historic.steps).toHaveLength(1);
      expect(historic.verdict).toBe('permitted');
    } finally {
      await doc.close();
    }
  });

  test('analyze: the working copy is one more revision; a partial signature cannot anchor', async () => {
    if (!supported()) return;
    const fx = opts.fixtures.unsignedSigField;
    const doc = await open(engineOf(), opts, fx);
    try {
      const prepared = await doc.signatures!.prepare({
        field: { kind: 'fqn', name: fx.fieldName },
        certify: { permission: 2 },
      });
      await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      const clean = await doc.signatures!.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(clean.steps).toHaveLength(0);
      expect(clean.verdict).toBe('unchanged');
      await doc.forms.setValue(
        { kind: 'fqn', name: fx.textField },
        { type: 'text', value: 'draft' },
      );
      const persisted = await doc.signatures!.analyze({ since: { signatureIndex: 0 } });
      expect(persisted.steps).toHaveLength(0);
      const working = await doc.signatures!.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(working.basis.source).toBe('working-copy');
      expect(working.steps).toHaveLength(1);
      expect(working.steps[0].levelInForce).toBe('fill');
      expect(working.verdict).toBe('permitted');
      expect(
        working.steps[0].findings.some((f) => f.rule === 'form-fill' && f.verdict === 'permitted'),
      ).toBe(true);
    } finally {
      await doc.close();
    }
    const partial = await open(engineOf(), opts, opts.fixtures.partialChain);
    try {
      expect(
        await caughtCode(() => partial.signatures!.analyze({ since: { signatureIndex: 0 } })),
      ).toBe(EngineErrorCode.InvalidArg);
      // A revision-anchored analysis over two later revisions: the net
      // state is judged in summary mode; `full` also carries every step.
      const byRevision = await partial.signatures!.analyze({ since: { revisionIndex: 0 } });
      expect(byRevision.later.revisionCount).toBe(2);
      expect(byRevision.steps).toHaveLength(0);
      const inFull = await partial.signatures!.analyze({ since: { revisionIndex: 0 }, detail: 'full' });
      expect(inFull.steps).toHaveLength(2);
      expect(inFull.current.verdict).toBe(byRevision.current.verdict);
    } finally {
      await partial.close();
    }
  });

  test('analyze: a page edit under a certification and a locked field edit are forbidden', async () => {
    if (!supported()) return;
    const permit = permitEngineOf();
    if (!permit) return;
    // Page deletion after a certification (permission 2): unexplained by every rule.
    const certified = await open(permit, opts, opts.fixtures.certified);
    let reopened: DocumentHandle | null = null;
    try {
      // A one-page fixture cannot lose its only page; a rotation is a page
      // dictionary change no signature permits either.
      const list = await certified.pages.list();
      await certified.pages.rotate([list.pages[0].ref], 90);
      const working = await certified.signatures!.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(working.verdict).toBe('forbidden');
      const bytes = await certified.download();
      reopened = await reopen(permit, opts, `${opts.fixtures.certified.id}-tampered`, bytes);
      const analysis = await reopened.signatures!.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.verdict).toBe('forbidden');
      expect(analysis.steps[0].findings.some((f) => f.verdict === 'forbidden')).toBe(true);
    } finally {
      if (reopened) await reopened.close();
      await certified.close();
    }
    // Editing a FieldMDP-locked field: the lock rule, whatever the level.
    const locked = await open(permit, opts, opts.fixtures.fieldMdp);
    try {
      await locked.forms.setValue(
        { kind: 'fqn', name: opts.fixtures.fieldMdp.lockedField },
        { type: 'text', value: 'tampered' },
      );
      const working = await locked.signatures!.analyze({
        since: { signatureIndex: 0 },
        until: 'working-copy',
      });
      expect(working.verdict).toBe('forbidden');
      expect(working.steps[0].findings.some((f) => f.rule === 'field-lock')).toBe(true);
    } finally {
      await locked.close();
    }
  });
}

/** A minimal DER SEQUENCE standing in for a CMS: the engine's job ends at the bytes. */
const FAKE_CMS = new Uint8Array([0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02]);

async function caughtCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    return err instanceof EngineError ? err.code : 'not-an-engine-error';
  }
}

function runSigningTests(
  runner: ConformanceTestRunner,
  opts: SignatureConformanceOptions,
  engineOf: () => Engine,
  supported: () => boolean,
): void {
  const { test, expect } = runner;
  const fx = () => opts.fixtures.unsignedSigField;
  const sigRef = () => ({ kind: 'fqn', name: fx().fieldName }) as const;
  const textRef = () => ({ kind: 'fqn', name: fx().textField }) as const;

  test('sign: prepare seals a candidate, complete installs it, download returns it verbatim', async () => {
    if (!supported()) return;
    const engine = engineOf();
    const doc = await open(engine, opts, fx());
    const events: string[] = [];
    const unsubscribe = doc.events.subscribe((event) => events.push(event.type));
    let reopened: DocumentHandle | null = null;
    try {
      const v0 = await doc.version!();
      const before = await doc.signatures!.list();
      expect(before.revisions).toHaveLength(1);
      expect(before.signatures).toHaveLength(1);
      expect(before.signatures[0].signed).toBe(false);
      expect(before.protection.judged).toBeNull();

      const prepared = await doc.signatures!.prepare({
        field: sigRef(),
        subFilter: 'ETSI.CAdES.detached',
        digest: 'sha256',
        contentsSize: 1024,
        attribution: { reason: 'conformance' },
      });
      expect(prepared.digest.byteLength).toBe(32);
      expect(prepared.algorithm).toBe('sha256');
      expect(prepared.subFilter).toBe('ETSI.CAdES.detached');
      expect(prepared.contentsSize).toBe(1024);
      expect(prepared.byteRange[0]).toBe(0);
      expect(prepared.byteRange[2] > prepared.byteRange[1]).toBe(true);
      expect(prepared.expectedVersion.baseSha256).toBe(v0.sha256);

      // The fence: nothing mutates while a candidate is parked.
      expect(await caughtCode(() => doc.signatures!.prepare({ field: sigRef() }))).toBe(
        EngineErrorCode.SigningPending,
      );
      expect(
        await caughtCode(() => doc.forms.setValue(textRef(), { type: 'text', value: 'x' })),
      ).toBe(EngineErrorCode.SigningPending);
      // The live document is untouched.
      const during = await doc.signatures!.list();
      expect(during.signatures[0].signed).toBe(false);
      expect((await doc.version!()).sha256).toBe(v0.sha256);

      // A stale expectedVersion cannot complete.
      expect(
        await caughtCode(() =>
          doc.signatures!.complete({
            signingId: prepared.signingId,
            cms: FAKE_CMS,
            expectedVersion: {
              baseSha256: prepared.expectedVersion.baseSha256,
              editsVersion: prepared.expectedVersion.editsVersion + 1,
            },
          }),
        ),
      ).toBe(EngineErrorCode.SigningVersionMismatch);

      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signed).toBe(true);
      expect(result.signature.fieldName).toBe(fx().fieldName);
      expect(result.signature.coverage).toBe('whole-revision');
      expect(result.signature.revisionIndex).toBe(1);
      expect(result.signature.subFilter).toBe('ETSI.CAdES.detached');
      expect(result.signature.signer.reason).toBe('conformance');
      expect(result.signature.contentsSize).toBe(FAKE_CMS.byteLength);
      expect(result.previous).toEqual(prepared.expectedVersion);
      expect(result.version.sha256 === v0.sha256).toBe(false);
      expect(result.protection.judged).toBe('annotate');
      expect(result.protection.enforced).toBeNull();
      expect(result.meta.affectedPages.length >= 1).toBe(true);

      // The session is on the new version, and every byte fact follows.
      expect(await doc.version!()).toEqual(result.version);
      const after = await doc.signatures!.list();
      expect(after.revisions).toHaveLength(2);
      expect(after.signatures[0].signed).toBe(true);
      expect(after.signatures[0].revisionIndex).toBe(1);
      expect(after.revisions[1].signatureIndex).toBe(0);
      expect(toHex(await doc.signatures!.digest(sigRef(), 'sha256'))).toBe(toHex(prepared.digest));
      expect(bytesEqual(await doc.signatures!.contents(sigRef()), FAKE_CMS)).toBe(true);

      // download() is the sealed file, byte for byte: nothing is re-saved.
      const bytes = await doc.download();
      expect(bytes.byteLength).toBe(result.version.byteLength);
      expect(await sha256Hex(bytes)).toBe(result.version.sha256);
      reopened = await reopen(engine, opts, `${fx().id}-signed`, bytes);
      const fresh = await reopened.signatures!.list();
      expect(fresh.revisions).toHaveLength(2);
      expect(fresh.signatures[0].coverage).toBe('whole-revision');
      expect(toHex(await reopened.signatures!.digest(sigRef(), 'sha256'))).toBe(
        toHex(prepared.digest),
      );

      // Idempotent replay, then the fence is gone.
      const replay = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(replay.status).toBe('already-completed');
      expect(replay.version).toEqual(result.version);
      expect((await doc.signatures!.abort(prepared.signingId)).status).toBe('already-completed');
      expect((await doc.signatures!.abort('never-prepared')).status).toBe('unknown');
      await doc.forms.setValue(textRef(), { type: 'text', value: 'after' });
      // Signing the same field again is refused: it is signed.
      expect(await caughtCode(() => doc.signatures!.prepare({ field: sigRef() }))).toBe(
        EngineErrorCode.SignatureRefused,
      );

      expect(events.filter((t) => t === 'signature.prepared')).toHaveLength(1);
      expect(events.filter((t) => t === 'signature.completed')).toHaveLength(1);
      expect(events.filter((t) => t === 'document.versioned')).toHaveLength(1);
    } finally {
      unsubscribe();
      if (reopened) await reopened.close();
      await doc.close();
    }
  });

  test("sign: unsaved edits are sealed in the signature's own revision (layer session)", async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, fx());
    try {
      await doc.forms.setValue(textRef(), { type: 'text', value: 'unsaved' });
      const prepared = await doc.signatures!.prepare({ field: sigRef() });
      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      // The candidate is a layer over the session's own base fed the artifact a
      // save would write: edits and signature land in ONE revision, as Acrobat
      // saves a fill-and-sign. (A plain session freezes the edits first: two.)
      expect(result.signature.revisionIndex).toBe(1);
      const after = await doc.signatures!.list();
      expect(after.revisions).toHaveLength(2);
      const text = await doc.forms.get(textRef());
      expect((text as { value?: string }).value).toBe('unsaved');
      const bytes = await doc.download();
      expect(await sha256Hex(bytes)).toBe(result.version.sha256);
    } finally {
      await doc.close();
    }
  });

  test('sign: a certification protects the document from the moment it completes', async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, fx());
    try {
      expect(doc.security.allows('doc.pages.assemble')).toBe(true);
      const prepared = await doc.signatures!.prepare({
        field: sigRef(),
        certify: { permission: 2 },
        subFilter: 'adbe.pkcs7.detached',
      });
      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.signature.docMdp).toBe(2);
      expect(result.signature.catalogCertification).toBe(true);
      expect(result.protection.judged).toBe('fill');
      expect(result.protection.enforced).toBe('fill');
      expect(result.protection.certification).toEqual({
        signatureIndex: result.signature.index,
        permission: 2,
      });
      expect(doc.security.allows('doc.pages.assemble')).toBe(false);
      expect(doc.security.allows('doc.forms.fill')).toBe(true);
      const list = await doc.pages.list();
      expect(await caughtCode(() => doc.pages.delete([list.pages[0].ref]))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
      expect(await caughtCode(() => doc.download({ mode: 'rewrite' }))).toBe(
        EngineErrorCode.ProtectedDocument,
      );
      // Filling is still permitted (P = 2), and the certification survives it.
      await doc.forms.setValue(textRef(), { type: 'text', value: 'filled' });
      const after = await doc.signatures!.list();
      expect(after.signatures[0].coverage).toBe('whole-revision');
    } finally {
      await doc.close();
    }
  });

  test('sign: a lock freezes the named fields and is mirrored on the field', async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, fx());
    try {
      const prepared = await doc.signatures!.prepare({
        field: sigRef(),
        lock: { action: 'include', fields: [fx().textField] },
      });
      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.signature.fieldMdp).toEqual({ action: 'include', fields: [fx().textField] });
      expect(result.signature.lock).toEqual({ action: 'include', fields: [fx().textField] });
      expect(result.protection.fieldLocks.length >= 1).toBe(true);
      expect(
        await caughtCode(() => doc.forms.setValue(textRef(), { type: 'text', value: 'nope' })),
      ).toBe(EngineErrorCode.ProtectedDocument);
    } finally {
      await doc.close();
    }
  });

  test('sign: abort discards the candidate and lifts the fence', async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, fx());
    try {
      const v0 = await doc.version!();
      const prepared = await doc.signatures!.prepare({ field: sigRef() });
      expect((await doc.signatures!.abort(prepared.signingId)).status).toBe('aborted');
      expect((await doc.signatures!.list()).signatures[0].signed).toBe(false);
      expect((await doc.version!()).sha256).toBe(v0.sha256);
      await doc.forms.setValue(textRef(), { type: 'text', value: 'free again' });
      expect(
        await caughtCode(() =>
          doc.signatures!.complete({
            signingId: prepared.signingId,
            cms: FAKE_CMS,
            expectedVersion: prepared.expectedVersion,
          }),
        ),
      ).toBe(EngineErrorCode.NotFound);
    } finally {
      await doc.close();
    }
  });

  test('sign: artwork from a PDF page lands on the widget', async () => {
    if (!supported()) return;
    const doc = await open(engineOf(), opts, fx());
    try {
      const artwork = await opts.fixtures.artwork.bytes();
      const prepared = await doc.signatures!.prepare({
        field: sigRef(),
        appearance: { pdf: artwork, pageIndex: 0 },
      });
      const result = await doc.signatures!.complete({
        signingId: prepared.signingId,
        cms: FAKE_CMS,
        expectedVersion: prepared.expectedVersion,
      });
      expect(result.signature.coverage).toBe('whole-revision');
      expect(result.signature.widget).toBeTruthy();
      const page = doc.page(result.signature.widget!.page!);
      const annots = await page.annotations.list();
      const widget = annots.annotations.find(
        (a) =>
          a.ref.kind === 'objectNumber' &&
          a.ref.annotObjectNumber === result.signature.widget!.annotObjectNumber,
      );
      expect(widget).toBeTruthy();
    } finally {
      await doc.close();
    }
  });

  if (opts.openKind === 'layerBytes') {
    test('sign: a layer session keeps its kind, with an empty layer over the new base', async () => {
      if (!supported()) return;
      const doc = await open(engineOf(), opts, fx());
      try {
        const prepared = await doc.signatures!.prepare({ field: sigRef() });
        const result = await doc.signatures!.complete({
          signingId: prepared.signingId,
          cms: FAKE_CMS,
          expectedVersion: prepared.expectedVersion,
        });
        const layer = await doc.downloadLayer!();
        expect(layer.byteLength > 0).toBe(true);
        expect(await sha256Hex(await doc.download())).toBe(result.version.sha256);
      } finally {
        await doc.close();
      }
    });
  }
}

async function reopen(
  engine: Engine,
  opts: SignatureConformanceOptions,
  id: string,
  bytes: Uint8Array,
): Promise<DocumentHandle> {
  if (opts.openKind === 'layerBytes') {
    return engine.open({ kind: 'layerBytes', id, baseBytes: bytes });
  }
  return engine.open({ kind: 'bytes', id, bytes });
}

async function open(
  engine: Engine,
  opts: SignatureConformanceOptions,
  fixture: ConformanceFixture,
): Promise<DocumentHandle> {
  if (opts.openKind === 'bytes') {
    return engine.open({ kind: 'bytes', id: fixture.id, bytes: await fixture.bytes() });
  }
  if (opts.openKind === 'layerBytes') {
    return engine.open({
      kind: 'layerBytes',
      id: `${fixture.id}-layer`,
      baseBytes: await fixture.bytes(),
    });
  }
  return engine.open({ kind: 'id', id: fixture.cloudId ?? fixture.id });
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return toHex(new Uint8Array(digest));
}

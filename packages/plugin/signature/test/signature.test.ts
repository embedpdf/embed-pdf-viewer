/**
 * The signature plugin over a real engine: the act (sign, two-phase, visual
 * fill, clear), the destination rule (`placeMark` by mode, free placement),
 * the facts (snapshot, parked signing, verdicts with the signer's own
 * anchor) for every session, and the armed-mark handler's capture decision.
 * The form and stamp plugins are stubbed at their contracts: the plugin only
 * ever asks them for a widget hit, a field, and an asset's bytes.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CapabilityToken } from '@embedpdf/core';
import { createTestContext, type TestContext } from '@embedpdf/core/testing';
import {
  buildDetachedCms,
  createTestSigner,
  memoryKeyStore,
  personalSigner,
  profileFor,
  remoteSigner,
} from '@embedpdf/core-signature';
import {
  toPageRef,
  type DocumentEvent,
  type DocumentHandle,
  type EventOrigin,
  type FormFieldDTO,
  type FormFieldRef,
  type SignatureDTO,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '@embedpdf/engine';
import { FormToken } from '@embedpdf/plugin-form/contract';
import type { PointerSample } from '@embedpdf/plugin-interaction/contract';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import type { SignatureCapability, SignatureConfig, SignatureSignedEvent } from '../src/contract';
import { createSignatureController } from '../src/controller';
import { initialSignatureState, type SignatureState } from '../src/model';
import { createArmedMarkHandler } from '../src/tools/armed-mark';

/** Every event the capability fires, in one list the cases can read in order. */
type SignatureChange =
  | { type: 'signed'; field: FormFieldRef; origin: SignatureSignedEvent['origin'] }
  | { type: 'filled'; field: FormFieldRef }
  | { type: 'cleared'; field: FormFieldRef }
  | { type: 'ask'; field: FormFieldRef; mark: unknown }
  | { type: 'inspect'; field: FormFieldRef }
  | { type: 'target'; field: FormFieldRef | null }
  | { type: 'validated'; verdicts: readonly unknown[] }
  | { type: 'invalidating'; field: FormFieldRef; detail: string }
  | { type: 'protectionChanged' };
const collectEvents = (signature: SignatureCapability, into: SignatureChange[]): void => {
  signature.onSigned((event) =>
    into.push({ type: 'signed', field: event.field, origin: event.origin }),
  );
  signature.onFilled((event) => into.push({ type: 'filled', ...event }));
  signature.onCleared((event) => into.push({ type: 'cleared', ...event }));
  signature.onSignRequested((event) =>
    into.push({ type: 'ask', field: event.field, mark: event.mark }),
  );
  signature.onInspectionRequested((event) => into.push({ type: 'inspect', field: event.field }));
  signature.onTargetChanged((event) => into.push({ type: 'target', field: event.field }));
  signature.onValidated((event) => into.push({ type: 'validated', verdicts: event.verdicts }));
  signature.onInvalidating((event) =>
    into.push({ type: 'invalidating', field: event.field, detail: event.detail }),
  );
  signature.onProtectionChanged(() => into.push({ type: 'protectionChanged' }));
};

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../engine/main/test/fixtures');

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
let engine: Engine;
let base: Uint8Array;
let artwork: Uint8Array;
let openCount = 0;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
  artwork = new Uint8Array(await readFile(resolve(fixtures, 'signature_artwork.pdf')));
});
afterAll(async () => {
  await engine.destroy();
});

const SIG: FormFieldRef = { kind: 'fqn', name: 'sig' };

function signatureField(overrides: Partial<FormFieldDTO> = {}): FormFieldDTO {
  return {
    ref: { kind: 'objectNumber', fieldObjectNumber: 9 },
    fieldObjectNumber: 9,
    name: 'sig',
    family: 'signature',
    origin: 'acroform',
    flags: { readOnly: false, required: false, noExport: false, raw: 0 },
    alternateName: null,
    mappingName: null,
    valueEntry: { kind: 'none' },
    defaultValueEntry: { kind: 'none' },
    widgets: [{ annotObjectNumber: 9, page: toPageRef(3) }],
    ...overrides,
  } as FormFieldDTO;
}

/** Contexts a case opened; disposed after it, so no re-judgement timer outlives its case. */
const contexts: TestContext<SignatureState>[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.dispose();
});

/** The signature capability over a kernel context bound to `doc`, connected. */
function makeSignature(
  doc: DocumentHandle,
  config: SignatureConfig = {},
  options: { stamp?: Record<string, unknown>; form?: Record<string, unknown> } = {},
) {
  const form = { getFieldForWidget: () => null, ...options.form };
  const capabilities: [CapabilityToken<unknown>, unknown][] = [[FormToken, form]];
  if (options.stamp) capabilities.push([StampToken, options.stamp]);
  const ctx = createTestContext({
    id: 'signature',
    state: initialSignatureState(),
    documentId: 'doc-1',
    doc,
    capabilities,
  });
  contexts.push(ctx);
  return { ctx, signature: ctx.connect(createSignatureController(ctx, config)) };
}

async function openDoc() {
  return engine.open(
    { kind: 'bytes', id: `sig-plugin-${++openCount}`, bytes: base },
    { scope: ['*'] },
  );
}

const stampStub = (bytes: Uint8Array) => ({
  readAssetBytes: (id: string) => (id === 'people:signature' ? bytes : null),
  getLibrary: (id: string) => (id === 'people' ? { id, kind: 'signatures', name: 'Bob' } : null),
  getArmedAsset: vi.fn(() => ({ id: 'people:signature', libraryId: 'people', name: 'signature' })),
  disarm: vi.fn(),
  placeAsset: vi.fn(async () => ({
    kind: 'objectNumber',
    annotObjectNumber: 1,
    page: toPageRef(3),
  })),
});

const settle = (delayMs: number) => new Promise((resolve) => setTimeout(resolve, delayMs));

describe('mode', () => {
  it('is visual without a key and sign with one, unless configured', async () => {
    const doc = await openDoc();
    try {
      const { signature: visual } = makeSignature(doc, {});
      expect(visual.getMode()).toBe('visual');
      expect(visual.canSign()).toBe(false);
      const signer = await createTestSigner();
      const { signature: signing } = makeSignature(doc, { key: signer });
      expect(signing.getMode()).toBe('sign');
      expect(signing.canSign()).toBe(true);
      expect(signing.canCertify()).toBe(false);
      const { signature: asking } = makeSignature(doc, {
        key: signer,
        mode: 'ask',
        allowCertify: true,
      });
      expect(asking.getMode()).toBe('ask');
      expect(asking.canCertify()).toBe(true);
    } finally {
      await doc.close();
    }
  });
});

describe('visual fill', () => {
  it('draws the mark into an unsigned field, clears it, and never seals', async () => {
    const doc = await openDoc();
    try {
      const { signature } = makeSignature(doc, {}, { stamp: stampStub(artwork) });
      const events: SignatureChange[] = [];
      collectEvents(signature, events);
      await signature.refresh();
      expect(signature.getSignature(SIG)).toMatchObject({ fieldName: 'sig', signed: false });

      await signature.fillField(SIG, { assetId: 'people:signature' });
      // An occurrence of this session's verb: the field, and nothing else.
      expect(events.at(-1)).toEqual({ type: 'filled', field: SIG });
      expect(signature.isBusy()).toBe(false);
      expect((await doc.signatures.list()).signatures[0]!.signed).toBe(false);

      await signature.clearField(SIG);
      expect(events.at(-1)).toEqual({ type: 'cleared', field: SIG });

      // Bytes the embedder brings work the same way.
      await signature.fillField(SIG, { source: artwork });
      expect(events.at(-1)).toMatchObject({ type: 'filled' });
      // A mark the stamp plugin does not know is an error, not a blank fill.
      await expect(signature.fillField(SIG, { assetId: 'nope' })).rejects.toMatchObject({
        name: 'PluginError',
        code: 'not-found',
        message: expect.stringMatching(/unknown mark/),
      });
    } finally {
      await doc.close();
    }
  });
});

describe('signing', () => {
  it('seals the field with the mark as appearance, defaults /Name to the certificate, and validates against its anchor', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner({ commonName: 'Bob Singor' });
    try {
      const { signature } = makeSignature(
        doc,
        { key: signer, trust: { anchors: async () => [signer.certificate] } },
        { stamp: stampStub(artwork) },
      );
      const events: SignatureChange[] = [];
      collectEvents(signature, events);
      await signature.refresh();
      signature.setTarget(SIG);
      expect(events.at(-1)).toMatchObject({ type: 'target', field: SIG });

      const result = await signature.sign({
        field: SIG,
        mark: { assetId: 'people:signature' },
        signer: { reason: 'approved' },
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signer).toMatchObject({ name: 'Bob Singor', reason: 'approved' });
      expect(signature.getTarget()).toBeNull(); // the signed field is no longer the target
      expect(signature.getPending()).toBeNull();
      // The confirmed event already carried the sealed field's facts.
      expect(signature.getSignature(SIG)).toMatchObject({
        signed: true,
        coverage: 'whole-revision',
      });
      expect(
        signature.getSignature({ annotObjectNumber: result.signature.widget!.annotObjectNumber })
          ?.signed,
      ).toBe(true);
      const signedEvents = events.filter((event) => event.type === 'signed');
      expect(signedEvents).toHaveLength(1);
      expect(signedEvents[0]).toMatchObject({
        field: result.signature.field,
        origin: { locality: 'local' },
      });
      expect(events.some((event) => event.type === 'protectionChanged')).toBe(true);

      const verdicts = await signature.validate();
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0]!.summary).toBe('valid');
      expect(signature.getVerdict(SIG)?.integrity).toBe('valid');
      expect(signature.listVerdicts()).toBe(verdicts);

      // Sealed: no visual fill, no second seal of the same field.
      await expect(signature.fillField(SIG, { assetId: 'people:signature' })).rejects.toMatchObject(
        { name: 'PluginError', code: 'conflict', message: expect.stringMatching(/is signed/) },
      );
      await expect(signature.clearField(SIG)).rejects.toThrow(/is signed/);

      const analysis = await signature.analyzeChanges({ since: { signatureIndex: 0 } });
      expect(analysis.verdict).toBe('unchanged');
    } finally {
      await doc.close();
    }
  });

  it('parks a two-phase signing from its confirmed event, and completes or cancels it', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner();
    try {
      const { signature } = makeSignature(doc, {}, { stamp: stampStub(artwork) });
      const events: SignatureChange[] = [];
      collectEvents(signature, events);
      await signature.refresh();

      const aborted = await signature.prepareSignature({
        field: SIG,
        mark: { assetId: 'people:signature' },
      });
      expect(signature.getPending()).toEqual({ signingId: aborted.signingId, field: SIG });
      await signature.cancelPending();
      expect(signature.getPending()).toBeNull();

      const prepared = await signature.prepareSignature({
        field: SIG,
        mark: { assetId: 'people:signature' },
      });
      expect(signature.getPending()?.signingId).toBe(prepared.signingId);
      const cms = await buildDetachedCms({
        digest: prepared.digest,
        hash: prepared.algorithm,
        profile: profileFor('ETSI.CAdES.detached'),
        signer,
      });
      const result = await signature.completeSignature(prepared.signingId, cms);
      expect(result.status).toBe('completed');
      expect(signature.getPending()).toBeNull();
      expect(signature.getSignature(SIG)?.signed).toBe(true);
      expect(events.filter((event) => event.type === 'signed')).toHaveLength(1);
      await expect(signature.completeSignature('never-prepared', cms)).rejects.toMatchObject({
        name: 'PluginError',
        code: 'not-found',
      });
    } finally {
      await doc.close();
    }
  });

  it('drops a parked signing the engine answers it does not know', async () => {
    const doc = await openDoc();
    try {
      // An engine that lost the signing (an expired candidate): the abort
      // answers `unknown` and publishes no event.
      const signatures = doc.signatures!;
      const forgetful = new Proxy(signatures, {
        get: (target, key) => {
          if (key === 'abort') return async () => ({ status: 'unknown' as const });
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const handle = new Proxy(doc, {
        get: (target, key) => {
          if (key === 'signatures') return forgetful;
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
      const { signature } = makeSignature(handle, {}, { stamp: stampStub(artwork) });
      await signature.refresh();
      await signature.prepareSignature({ field: SIG, mark: { assetId: 'people:signature' } });
      expect(signature.getPending()).not.toBeNull();

      await signature.cancelPending();
      expect(signature.getPending()).toBeNull();
    } finally {
      await doc.close();
    }
  });

  it('signs through a CMS signer and a persisted personal identity', async () => {
    const doc = await openDoc();
    const hardwareSigner = await createTestSigner();
    try {
      // A remote signer: the digest goes out, the CMS comes back; here built
      // by a raw signer standing in for the service.
      const remote = remoteSigner({
        sign: ({ digest, algorithm, subFilter }) =>
          buildDetachedCms({
            digest,
            hash: algorithm,
            profile: profileFor(subFilter),
            signer: hardwareSigner,
          }),
      });
      const { signature } = makeSignature(
        doc,
        { key: () => Promise.resolve(remote) },
        { stamp: stampStub(artwork) },
      );
      const result = await signature.sign({ field: SIG, mark: { source: artwork } });
      expect(result.status).toBe('completed');
      // No certificate on a CMS signer: no default name.
      expect(result.signature.signer.name).toBeNull();
    } finally {
      await doc.close();
    }

    const store = memoryKeyStore();
    const first = await personalSigner({ subject: 'Ada Lovelace', store });
    const again = await personalSigner({ subject: 'Ada Lovelace', store });
    expect(again.certificate).toEqual(first.certificate); // one identity per subject, persisted
    // `privateKey` is deliberately not on the type; probe the runtime object.
    const probe: typeof first & { privateKey?: unknown } = first;
    expect(probe.privateKey === undefined).toBe(true); // never exposed
    const secondDoc = await openDoc();
    try {
      const { signature } = makeSignature(
        secondDoc,
        { key: again, trust: { anchors: async () => [first.certificate] } },
        { stamp: stampStub(artwork) },
      );
      const result = await signature.sign({ field: SIG, mark: { source: artwork } });
      expect(result.signature.signer.name).toBe('Ada Lovelace');
      expect((await signature.validate())[0]!.summary).toBe('valid');
    } finally {
      await secondDoc.close();
    }
  });
});

describe('facts from every session', () => {
  it('fires onSigned, parks and releases the signing, and shows the sealed field for a signing another session completed', async () => {
    // The facts of an unsigned document, read from the real engine; the
    // document the plugin watches is a stub, so the remote events can be
    // delivered by hand.
    const doc = await openDoc();
    const unsigned = await doc.signatures.list();
    await doc.close();
    const field = unsigned.signatures[0]!;
    const sealed: SignatureDTO = {
      ...field,
      signed: true,
      coverage: 'whole-revision',
      revisionIndex: 1,
    };
    const protection = { ...unsigned.protection, judged: 'annotate' as const };
    const remote: EventOrigin = {
      kind: 'remote',
      sessionId: 'other-session',
      sub: 'alice',
      ts: 1,
      serverId: 7,
    };
    const { ctx, signature } = makeSignature({
      signatures: { list: async () => unsigned },
      security: { allows: () => true },
      forms: {},
    } as unknown as DocumentHandle);
    const events: SignatureChange[] = [];
    collectEvents(signature, events);
    await signature.refresh();
    expect(signature.getSignature(field.field)?.signed).toBe(false);

    ctx.emitDocumentEvent({
      type: 'signatures.prepared',
      signingId: 'remote-signing',
      field: field.field,
      origin: remote,
    });
    expect(signature.getPending()).toEqual({ signingId: 'remote-signing', field: field.field });

    ctx.emitDocumentEvent({
      type: 'signatures.completed',
      signingId: 'remote-signing',
      origin: remote,
      status: 'completed',
      signature: sealed,
      version: { sha256: 'after', byteLength: 2 },
      previous: { sha256: 'before', byteLength: 1 },
      protection,
      meta: {},
    } as unknown as DocumentEvent);

    expect(signature.getPending()).toBeNull();
    expect(signature.getSignature(field.field)?.signed).toBe(true);
    expect(signature.getProtection()).toEqual(protection);
    expect(events.filter((event) => event.type === 'signed')).toEqual([
      {
        type: 'signed',
        field: field.field,
        origin: { locality: 'remote', sessionId: 'other-session', actorId: 'alice' },
      },
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'signed' });
    expect(events.some((event) => event.type === 'protectionChanged')).toBe(true);
  });
});

describe('the destination rule', () => {
  it('placeMark on a field follows the mode; elsewhere it is a stamp', async () => {
    const doc = await openDoc();
    const stamp = stampStub(artwork);
    try {
      const events: SignatureChange[] = [];
      const { signature: ask } = makeSignature(doc, { mode: 'ask' }, { stamp });
      collectEvents(ask, events);
      await ask.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(events.at(-1)).toMatchObject({
        type: 'ask',
        field: SIG,
        mark: { assetId: 'people:signature' },
      });
      expect((await doc.signatures.list()).signatures[0]!.signed).toBe(false);

      await ask.placeMark(
        { assetId: 'people:signature' },
        { page: toPageRef(3), at: { x: 10, y: 10 } },
      );
      expect(stamp.placeAsset).toHaveBeenCalledWith('doc-1', 'people:signature', {
        page: toPageRef(3),
        at: { x: 10, y: 10 },
      });

      const { signature: visual } = makeSignature(doc, { mode: 'visual' }, { stamp });
      const seen: SignatureChange[] = [];
      collectEvents(visual, seen);
      await visual.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(seen.at(-1)).toMatchObject({ type: 'filled' });
    } finally {
      await doc.close();
    }
  });
});

describe('the armed mark over a field', () => {
  const sample = (pageObjectNumber: number, point: { x: number; y: number }): PointerSample =>
    ({
      phase: 'down',
      viewport: point,
      page: { ref: toPageRef(pageObjectNumber), point },
      modifiers: {},
    }) as unknown as PointerSample;

  it('captures only for a signatures-library mark over an unsigned signature widget', () => {
    const placeMark = vi.fn(async () => {});
    const signature = { placeMark, getSignature: () => null } as never;
    const stamp = stampStub(artwork);
    const hits: Record<string, ReturnType<typeof signatureField> | null> = {
      sig: signatureField(),
      text: signatureField({ family: 'text', name: 'name' } as Partial<FormFieldDTO>),
      signed: signatureField({ valueEntry: { kind: 'unsupported' } }),
    };
    let where: keyof typeof hits | 'nothing' = 'sig';
    const form = {
      getWidgetAt: () =>
        where === 'nothing'
          ? null
          : { annotObjectNumber: 9, field: hits[where], box: { x: 0, y: 0, width: 1, height: 1 } },
    } as never;
    const handler = createArmedMarkHandler('doc-1', signature, form, stamp as never);
    expect(handler.enabledFor({ id: 'stamp', enables: new Set() } as never)).toBe(true);
    expect(handler.enabledFor({ id: 'pointer', enables: new Set() } as never)).toBe(false);

    // Over an unsigned signature field: the mark goes into the field, the tool disarms.
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(true);
    expect(placeMark).toHaveBeenCalledWith(
      { assetId: 'people:signature' },
      { field: hits.sig!.ref },
    );
    expect(stamp.disarm).toHaveBeenCalledWith('doc-1');

    // Elsewhere the click stays a stamp placement (decline).
    where = 'text';
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
    where = 'nothing';
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
    // A signed field is final: consumed, nothing placed.
    where = 'signed';
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(true);
    expect(placeMark).toHaveBeenCalledTimes(1);

    // A plain stamp (any other library) never captures.
    stamp.getArmedAsset.mockReturnValue({ id: 'std:Approved', libraryId: 'std', name: 'Approved' });
    where = 'sig';
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
    stamp.getArmedAsset.mockReturnValue(null as never);
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
  });
});

describe('judging what a save would write', () => {
  it('re-judges the working copy after an edit, warns once, and keeps the persisted verdict apart', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner({ commonName: 'Working copy' });
    try {
      const { signature } = makeSignature(
        doc,
        { key: signer, trust: { anchors: async () => [signer.certificate] } },
        { stamp: stampStub(artwork) },
      );
      const events: SignatureChange[] = [];
      collectEvents(signature, events);
      await signature.refresh();
      await signature.sign({ field: SIG, mark: { assetId: 'people:signature' } });
      await signature.validate();
      expect(signature.getVerdict(SIG)).toMatchObject({
        summary: 'valid',
        modifications: { verdict: 'unchanged', basis: 'persisted' },
      });

      // An unsaved ink stroke: the plugin re-judges the working copy on its
      // own. Commenting is allowed after an approval signature (Acrobat's
      // reading; corpus v3/88), so the verdict is "changed, permitted" and
      // nothing warns.
      const page = (await doc.pages.list()).pages[0]!;
      const ink = () =>
        doc.page(page.ref).annotations.create({
          subtype: 'ink',
          inkList: [
            [
              { x: 20, y: 20 },
              { x: 80, y: 60 },
            ],
          ],
          rect: { left: 10, bottom: 600, right: 100, top: 700 },
          color: { r: 0, g: 0, b: 0 },
          strokeWidth: 2,
        } as never);
      const stroke = await ink();
      await settle(700);
      expect(signature.getVerdict(SIG)).toMatchObject({
        summary: 'valid',
        modifications: { verdict: 'permitted', basis: 'working-copy' },
      });
      expect(events.filter((event) => event.type === 'invalidating')).toHaveLength(0);

      // Remove the stroke: the document is the loaded one again, and the
      // plugin re-judges it as such: unchanged on the persisted basis (the
      // appearance stream left behind is an orphan the save never writes).
      await doc.page(page.ref).annotations.delete(stroke.annotation.ref);
      await settle(700);
      expect(signature.getVerdict(SIG)).toMatchObject({
        summary: 'valid',
        modifications: { verdict: 'unchanged', basis: 'persisted' },
      });

      // A new form field after an approval signature is not fill-in, signing
      // or commenting (corpus v3/86: "Form Fields Added", invalid): the
      // working copy is judged forbidden and the plugin warns, once.
      await doc.forms.create({ family: 'text', name: 'late_field' } as never);
      await settle(700);
      expect(signature.getVerdict(SIG)).toMatchObject({
        summary: 'invalid',
        modifications: { verdict: 'forbidden', basis: 'working-copy' },
      });
      const warnings = events.filter((event) => event.type === 'invalidating');
      expect(warnings).toHaveLength(1);
      // The field ref is the durable one the snapshot carries (object number).
      expect(warnings[0]).toMatchObject({ field: { kind: 'objectNumber' } });
      expect((warnings[0] as { detail: string }).detail).toMatch(/field/i);

      // A second forbidden edit changes nothing about the verdict: no second warning.
      await doc.forms.create({ family: 'text', name: 'later_field' } as never);
      await settle(700);
      expect(events.filter((event) => event.type === 'invalidating')).toHaveLength(1);

      // The loaded bytes still say valid: that is what a file on disk says.
      const persisted = await signature.validate({ until: 'persisted' });
      expect(persisted[0]!.summary).toBe('valid');
      expect(persisted[0]!.modifications.basis).toBe('persisted');
    } finally {
      await doc.close();
    }
  });

  it('offers the first signature as a choice when certification is allowed', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner();
    try {
      const { signature } = makeSignature(
        doc,
        { key: signer, allowCertify: true },
        { stamp: stampStub(artwork) },
      );
      const events: SignatureChange[] = [];
      collectEvents(signature, events);
      await signature.refresh();
      // Mode 'sign', but nothing is signed yet and a certification is on the
      // table: the chrome decides (its dialog), the plugin does not seal.
      await signature.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(events.at(-1)).toMatchObject({ type: 'ask', field: SIG });
      expect((await doc.signatures.list()).signatures[0]!.signed).toBe(false);
      // The chrome's answer: certify with P=3.
      const result = await signature.sign({
        field: SIG,
        mark: { assetId: 'people:signature' },
        certify: { permission: 3 },
      });
      expect(result.protection).toMatchObject({ enforced: 'annotate', judged: 'annotate' });
    } finally {
      await doc.close();
    }
  });
});

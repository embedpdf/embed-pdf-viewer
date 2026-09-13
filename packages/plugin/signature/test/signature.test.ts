/**
 * The signature plugin over a REAL engine: the act (sign, visual fill,
 * clear), the destination rule (`placeMark` by mode, free placement), the
 * reads (snapshot, verdicts with the signer's own anchor), and the armed-mark
 * handler's capture decision. The form and stamp plugins are stubbed at their
 * contracts: the plugin only ever asks them for a widget hit, a field, and an
 * asset's bytes.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PluginContext } from '@embedpdf/core';
import {
  createTestSigner,
  memoryKeyStore,
  personalSigner,
  remoteSigner,
} from '@embedpdf/core-signature';
import type { DocumentHandle, FormFieldDTO, FormFieldRef } from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '@embedpdf/engine';
import { FormToken } from '@embedpdf/plugin-form/contract';
import type { PointerSample } from '@embedpdf/plugin-interaction/contract';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import { createSignatureCapability } from '../src/capability';
import { createArmedMarkHandler } from '../src/handler';
import { initialSignatureState, signatureReducer } from '../src/reducer';
import type {
  SignatureAction,
  SignatureChange,
  SignatureConfig,
  SignatureState,
} from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '../../../engine/main/test/fixtures');

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
let engine: Engine;
let base: Uint8Array;
let artwork: Uint8Array;
let n = 0;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
  artwork = new Uint8Array(await readFile(resolve(fixtures, 'signature_artwork.pdf')));
});
afterAll(async () => {
  await engine.destroy();
});

const SIG: FormFieldRef = { kind: 'fqn', name: 'sig' };

function signatureField(over: Partial<FormFieldDTO> = {}): FormFieldDTO {
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
    widgets: [{ annotObjectNumber: 9, pageObjectNumber: 3 }],
    ...over,
  } as FormFieldDTO;
}

/** A live store + context stub: dispatch runs the real reducer. */
function makeCtx(
  doc: DocumentHandle,
  opts: { stamp?: Record<string, unknown>; form?: Record<string, unknown> } = {},
) {
  let state: SignatureState = initialSignatureState();
  const cleanups: Array<() => void | Promise<void>> = [];
  const form = { refresh: vi.fn(async () => {}), fieldForWidget: () => null, ...opts.form };
  const ctx = {
    id: 'signature',
    engine,
    documentId: 'doc-1',
    doc,
    getState: () => state,
    dispatch: (action: SignatureAction) => {
      state = signatureReducer(state, action);
    },
    subscribe: () => () => {},
    document: () => null,
    get: (token: unknown) => {
      if (token === FormToken) return form;
      throw new Error('unexpected capability');
    },
    tryGet: (token: unknown) => (token === StampToken ? (opts.stamp ?? null) : null),
    cleanup: (fn: () => void | Promise<void>) => cleanups.push(fn),
  } as unknown as PluginContext<SignatureState, SignatureAction>;
  return { ctx, form, dispose: () => Promise.all(cleanups.map((fn) => fn())) };
}

async function openDoc() {
  return engine.open({ kind: 'bytes', id: `sig-plugin-${++n}`, bytes: base }, { scope: ['*'] });
}

const stampStub = (bytes: Uint8Array) => ({
  assetBytes: (id: string) => (id === 'people:signature' ? bytes : null),
  library: (id: string) => (id === 'people' ? { id, kind: 'signatures', name: 'Bob' } : null),
  armedAsset: vi.fn(() => ({ id: 'people:signature', libraryId: 'people', name: 'signature' })),
  disarm: vi.fn(),
  placeAsset: vi.fn(async () => ({
    kind: 'objectNumber',
    annotObjectNumber: 1,
    pageObjectNumber: 3,
  })),
});

describe('mode', () => {
  it('is visual without a signer and sign with one, unless configured', async () => {
    const doc = await openDoc();
    try {
      const a = createSignatureCapability(makeCtx(doc).ctx, {});
      expect(a.mode()).toBe('visual');
      expect(a.canSign()).toBe(false);
      const signer = await createTestSigner();
      const b = createSignatureCapability(makeCtx(doc).ctx, { signer });
      expect(b.mode()).toBe('sign');
      expect(b.canSign()).toBe(true);
      expect(b.canCertify()).toBe(false);
      const c = createSignatureCapability(makeCtx(doc).ctx, {
        signer,
        mode: 'ask',
        allowCertify: true,
      });
      expect(c.mode()).toBe('ask');
      expect(c.canCertify()).toBe(true);
    } finally {
      await doc.close();
    }
  });
});

describe('visual fill', () => {
  it('draws the mark into an unsigned field, clears it, and never seals', async () => {
    const doc = await openDoc();
    const { ctx, form } = makeCtx(doc, { stamp: stampStub(artwork) });
    try {
      const signature = createSignatureCapability(ctx, {});
      const events: SignatureChange[] = [];
      signature.onChanged((e) => events.push(e));
      await signature.refresh();
      expect(signature.signatureOf(SIG)).toMatchObject({ fieldName: 'sig', signed: false });

      await signature.fillField(SIG, { assetId: 'people:signature' });
      expect(form.refresh).toHaveBeenCalled();
      expect(events.at(-1)).toMatchObject({ type: 'filled', field: SIG });
      expect(signature.busy()).toBe(false);
      expect((await doc.signatures!.list()).signatures[0]!.signed).toBe(false);

      await signature.clearField(SIG);
      expect(events.at(-1)).toMatchObject({ type: 'cleared', field: SIG });

      // Bytes the embedder brings work the same way.
      await signature.fillField(SIG, { source: artwork });
      expect(events.at(-1)).toMatchObject({ type: 'filled' });
      // A mark the stamp plugin does not know is an error, not a blank fill.
      await expect(signature.fillField(SIG, { assetId: 'nope' })).rejects.toThrow(/unknown mark/);
    } finally {
      await doc.close();
    }
  });
});

describe('signing', () => {
  it('seals the field with the mark as appearance, defaults /Name to the certificate, and validates against its anchor', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner({ commonName: 'Bob Singor' });
    const { ctx } = makeCtx(doc, { stamp: stampStub(artwork) });
    try {
      const signature = createSignatureCapability(ctx, {
        signer,
        trust: { anchors: async () => [signer.certificate] },
      });
      const events: SignatureChange[] = [];
      signature.onChanged((e) => events.push(e));
      await signature.refresh();
      signature.setTarget(SIG);
      expect(events.at(-1)).toMatchObject({ type: 'target', field: SIG });

      const result = await signature.signField({
        field: SIG,
        mark: { assetId: 'people:signature' },
        attribution: { reason: 'approved' },
      });
      expect(result.status).toBe('completed');
      expect(result.signature.signer).toMatchObject({ name: 'Bob Singor', reason: 'approved' });
      expect(signature.target()).toBeNull(); // the signed field is no longer the target
      expect(signature.signatureOf(SIG)).toMatchObject({
        signed: true,
        coverage: 'whole-revision',
      });
      expect(
        signature.signatureOf({ annotObjectNumber: result.signature.widget!.annotObjectNumber })
          ?.signed,
      ).toBe(true);
      expect(events.some((e) => e.type === 'signed')).toBe(true);
      expect(events.some((e) => e.type === 'protectionChanged')).toBe(true);

      const verdicts = await signature.validate();
      expect(verdicts).toHaveLength(1);
      expect(verdicts[0]!.summary).toBe('valid');
      expect(signature.verdictOf(SIG)?.integrity).toBe('valid');
      expect(signature.verdicts()).toBe(verdicts);

      // Sealed: no visual fill, no second seal of the same field.
      await expect(signature.fillField(SIG, { assetId: 'people:signature' })).rejects.toThrow(
        /is signed/,
      );
      await expect(signature.clearField(SIG)).rejects.toThrow(/is signed/);

      const analysis = await signature.analyze({ since: { signatureIndex: 0 } });
      expect(analysis.verdict).toBe('unchanged');
    } finally {
      await doc.close();
    }
  });

  it('signs through a CMS signer and a persisted personal identity', async () => {
    const doc = await openDoc();
    const hsm = await createTestSigner();
    const { ctx } = makeCtx(doc, { stamp: stampStub(artwork) });
    try {
      // A remote signer: the digest goes out, the CMS comes back — here built
      // by a raw signer standing in for the service.
      const { buildDetachedCms, profileFor } = await import('@embedpdf/core-signature');
      const remote = remoteSigner({
        sign: ({ digest, algorithm, subFilter }) =>
          buildDetachedCms({
            digest,
            hash: algorithm,
            profile: profileFor(subFilter),
            signer: hsm,
          }),
      });
      const signature = createSignatureCapability(ctx, { signer: () => Promise.resolve(remote) });
      const result = await signature.signField({ field: SIG, mark: { source: artwork } });
      expect(result.status).toBe('completed');
      // No certificate on a CMS signer → no default name.
      expect(result.signature.signer.name).toBeNull();
    } finally {
      await doc.close();
    }

    const store = memoryKeyStore();
    const first = await personalSigner({ subject: 'Ada Lovelace', store });
    const again = await personalSigner({ subject: 'Ada Lovelace', store });
    expect(again.certificate).toEqual(first.certificate); // one identity per subject, persisted
    expect(first.privateKey === undefined).toBe(true); // never exposed
    const doc2 = await openDoc();
    try {
      const signature = createSignatureCapability(
        makeCtx(doc2, { stamp: stampStub(artwork) }).ctx,
        {
          signer: again,
          trust: { anchors: async () => [first.certificate] },
        },
      );
      const result = await signature.signField({ field: SIG, mark: { source: artwork } });
      expect(result.signature.signer.name).toBe('Ada Lovelace');
      expect((await signature.validate())[0]!.summary).toBe('valid');
    } finally {
      await doc2.close();
    }
  });
});

describe('the destination rule', () => {
  it('placeMark on a field follows the mode; elsewhere it is a stamp', async () => {
    const doc = await openDoc();
    const stamp = stampStub(artwork);
    const { ctx } = makeCtx(doc, { stamp });
    try {
      const events: SignatureChange[] = [];
      const ask = createSignatureCapability(ctx, { mode: 'ask' });
      ask.onChanged((e) => events.push(e));
      await ask.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(events.at(-1)).toMatchObject({
        type: 'ask',
        field: SIG,
        mark: { assetId: 'people:signature' },
      });
      expect((await doc.signatures!.list()).signatures[0]!.signed).toBe(false);

      await ask.placeMark(
        { assetId: 'people:signature' },
        { pageObjectNumber: 3, at: { x: 10, y: 10 } },
      );
      expect(stamp.placeAsset).toHaveBeenCalledWith('doc-1', 'people:signature', {
        pageObjectNumber: 3,
        at: { x: 10, y: 10 },
      });

      const visual = createSignatureCapability(makeCtx(doc, { stamp }).ctx, { mode: 'visual' });
      const seen: SignatureChange[] = [];
      visual.onChanged((e) => seen.push(e));
      await visual.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(seen.at(-1)).toMatchObject({ type: 'filled' });
    } finally {
      await doc.close();
    }
  });
});

describe('the armed mark over a field', () => {
  const sample = (pon: number, point: { x: number; y: number }): PointerSample =>
    ({
      phase: 'down',
      viewport: point,
      page: { pon, point },
      modifiers: {},
    }) as unknown as PointerSample;

  it('captures only for a signatures-library mark over an unsigned signature widget', () => {
    const placeMark = vi.fn(async () => {});
    const signature = { placeMark, signatureOf: () => null } as never;
    const stamp = stampStub(artwork);
    const hits: Record<string, ReturnType<typeof signatureField> | null> = {
      sig: signatureField(),
      text: signatureField({ family: 'text', name: 'name' } as Partial<FormFieldDTO>),
      signed: signatureField({ valueEntry: { kind: 'unsupported' } }),
    };
    let where: keyof typeof hits | 'nothing' = 'sig';
    const form = {
      widgetAt: () =>
        where === 'nothing'
          ? null
          : { annotObjectNumber: 9, field: hits[where], box: { x: 0, y: 0, width: 1, height: 1 } },
    } as never;
    const handler = createArmedMarkHandler('doc-1', signature, form, stamp as never);
    expect(handler.enabledFor({ id: 'stamp', enables: new Set() } as never)).toBe(true);
    expect(handler.enabledFor({ id: 'pointer', enables: new Set() } as never)).toBe(false);

    // Over an unsigned signature field: the mark goes INTO the field, the tool disarms.
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
    stamp.armedAsset.mockReturnValue({ id: 'std:Approved', libraryId: 'std', name: 'Approved' });
    where = 'sig';
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
    stamp.armedAsset.mockReturnValue(null as never);
    expect(handler.onDown(sample(3, { x: 0.5, y: 0.5 }))).toBe(false);
  });
});

describe('judging what a save would write', () => {
  it('re-judges the working copy after an edit, warns once, and keeps the persisted verdict apart', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner({ commonName: 'Working copy' });
    const { ctx, dispose } = makeCtx(doc, { stamp: stampStub(artwork) });
    try {
      const signature = createSignatureCapability(ctx, {
        signer,
        trust: { anchors: async () => [signer.certificate] },
      });
      const events: SignatureChange[] = [];
      signature.onChanged((e) => events.push(e));
      await signature.refresh();
      await signature.signField({ field: SIG, mark: { assetId: 'people:signature' } });
      await signature.validate();
      expect(signature.verdictOf(SIG)).toMatchObject({
        summary: 'valid',
        modifications: { verdict: 'unchanged', basis: 'persisted' },
      });

      // An unsaved ink stroke: the plugin re-judges the working copy on its own.
      const page = (await doc.pages.list()).pages[0]!;
      const ink = () =>
        doc.page(page.pageObjectNumber).annotations.create({
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
      const first = await ink();
      await new Promise((r) => setTimeout(r, 700));
      expect(signature.verdictOf(SIG)).toMatchObject({
        summary: 'invalid',
        modifications: { verdict: 'forbidden', basis: 'working-copy' },
      });
      const warnings = events.filter((e) => e.type === 'invalidating');
      expect(warnings).toHaveLength(1);
      // The field ref is the durable one the snapshot carries (object number).
      expect(warnings[0]).toMatchObject({ field: { kind: 'objectNumber' } });
      expect((warnings[0] as { detail: string }).detail).toMatch(/annotation/);

      // A second stroke changes nothing about the verdict: no second warning.
      const second = await ink();
      await new Promise((r) => setTimeout(r, 700));
      expect(events.filter((e) => e.type === 'invalidating')).toHaveLength(1);

      // The loaded bytes still say valid — that is what a file on disk says.
      const persisted = await signature.validate({ until: 'persisted' });
      expect(persisted[0]!.summary).toBe('valid');
      expect(persisted[0]!.modifications.basis).toBe('persisted');

      // Remove both strokes: the document is the loaded one again, and the
      // plugin re-judges it as such — valid on the persisted basis, and no
      // further warning (the appearance streams left behind are orphans the
      // save never writes).
      await doc.page(page.pageObjectNumber).annotations.delete(first.created.ref);
      await doc.page(page.pageObjectNumber).annotations.delete(second.created.ref);
      await new Promise((r) => setTimeout(r, 700));
      expect(signature.verdictOf(SIG)).toMatchObject({
        summary: 'valid',
        modifications: { verdict: 'unchanged', basis: 'persisted' },
      });
      expect(events.filter((e) => e.type === 'invalidating')).toHaveLength(1);
    } finally {
      await dispose();
      await doc.close();
    }
  });

  it('offers the first signature as a choice when certification is allowed', async () => {
    const doc = await openDoc();
    const signer = await createTestSigner();
    const { ctx } = makeCtx(doc, { stamp: stampStub(artwork) });
    try {
      const signature = createSignatureCapability(ctx, { signer, allowCertify: true });
      const events: SignatureChange[] = [];
      signature.onChanged((e) => events.push(e));
      await signature.refresh();
      // Mode 'sign', but nothing is signed yet and a certification is on the
      // table: the chrome decides (its dialog), the plugin does not seal.
      await signature.placeMark({ assetId: 'people:signature' }, { field: SIG });
      expect(events.at(-1)).toMatchObject({ type: 'ask', field: SIG });
      expect((await doc.signatures!.list()).signatures[0]!.signed).toBe(false);
      // The chrome's answer: certify with P=3.
      const result = await signature.signField({
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

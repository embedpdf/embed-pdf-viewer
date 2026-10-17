/**
 * The signature service: its setup error, its state without a document, and `signerRows()`, the
 * people whose marks the stamp plugin holds (a stand-in stamp plugin here: the real one draws
 * previews on a canvas, which happy-dom doesn't have).
 */
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { definePlugin, toPageRef, type CapabilityToken } from '@embedpdf/core';
import { StampToken, type StampAsset, type StampLibrary } from '@embedpdf/plugin-stamp/contract';
import { withInteraction } from '@embedpdf/angular/interaction';
import { withForm } from '@embedpdf/angular/form';
import { EpdfSignature, SIGNATURES_LIBRARY_KIND, withSignature } from '@embedpdf/angular/signature';
import { kernelOf, mount, viewerHost } from './fixtures';

const library = (id: string, name: string, kind: string): StampLibrary => ({
  id,
  name,
  kind,
  assetIds: [],
});

const asset = (libraryId: string, name: string, label: string): StampAsset => ({
  id: `${libraryId}:${name}`,
  libraryId,
  kind: 'stamp',
  name,
  label,
  size: { width: 120, height: 40 },
  page: toPageRef(1),
});

/** The two reads `signerRows()` makes, and a way for the test to add libraries. */
interface FakeStamp {
  listLibraries(filter?: { kind?: string | readonly string[] }): readonly StampLibrary[];
  listAssets(): readonly StampAsset[];
  add(libraries: StampLibrary[], assets: StampAsset[]): void;
}

/** The stamp plugin's own token, typed as the stand-in. */
const FakeStampToken = StampToken as unknown as CapabilityToken<FakeStamp>;

const fakeStampPlugin = definePlugin({
  id: 'stamp',
  scope: 'workspace',
  token: FakeStampToken,
  state: () => ({ libraries: [] as StampLibrary[], assets: [] as StampAsset[] }),
  create: (ctx) => ({
    api: {
      listLibraries: (filter) => {
        const kinds = filter?.kind === undefined ? null : ([] as string[]).concat(filter.kind);
        return ctx.state
          .get()
          .libraries.filter((candidate) => !kinds || kinds.includes(candidate.kind));
      },
      listAssets: () => ctx.state.get().assets,
      add: (libraries, assets) =>
        ctx.state.update((state) => ({
          libraries: [...state.libraries, ...libraries],
          assets: [...state.assets, ...assets],
        })),
    },
  }),
});

afterEach(() => TestBed.resetTestingModule());

describe('EpdfSignature', () => {
  it('names withSignature() when the viewer has no signature plugin', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withInteraction(), withForm()] }),
    );
    expect(() => fixture.debugElement.injector.get(EpdfSignature)).toThrow(/EPDF-102.*withSignature\(\)/);
  });

  it('has no signatures and no signer rows without a document or the stamp plugin', async () => {
    const fixture = await mount(
      viewerHost({ template: '', features: [withInteraction(), withForm(), withSignature()] }),
    );
    const signature = fixture.debugElement.injector.get(EpdfSignature);
    expect(signature.signatures()).toEqual([]);
    expect(signature.target()).toBeNull();
    expect(signature.busy()).toBe(false);
    expect(signature.signerRows()).toEqual([]);
  });

  it('lists each person of a signatures library with their signature and initials', async () => {
    const fixture = await mount(
      viewerHost({
        template: '',
        features: [withInteraction(), withForm(), { plugins: [fakeStampPlugin] }, withSignature()],
      }),
    );
    const signature = fixture.debugElement.injector.get(EpdfSignature);
    expect(signature.signerRows()).toEqual([]);

    const ada = library('ada', 'Ada Lovelace', SIGNATURES_LIBRARY_KIND);
    kernelOf(fixture)
      .capability(FakeStampToken)
      .add(
        [ada, library('approvals', 'Approvals', 'stamps')],
        [asset('ada', 'signature', 'Signature'), asset('ada', 'initials', 'Initials'), asset('approvals', 'ok', 'OK')],
      );

    // A library of another kind is no person.
    expect(signature.signerRows()).toEqual([
      {
        libraryId: 'ada',
        name: 'Ada Lovelace',
        library: ada,
        signatures: [expect.objectContaining({ label: 'Signature' })],
        initials: expect.objectContaining({ label: 'Initials' }),
      },
    ]);
  });
});

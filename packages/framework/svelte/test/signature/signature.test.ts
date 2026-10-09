import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { flushSync } from 'svelte';
import { fireEvent, waitFor } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { pageTransform } from '@embedpdf/core-geometry';
import { definePlugin, toPageRef } from '@embedpdf/core';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { FormToken, formPlugin, toFieldRef } from '../../src/form';
import { interactionPlugin } from '../../src/interaction';
import { makePageContext, type CurrentValue, type PageContextValue } from '../../src/runtime';
import { signaturePlugin, useSignatureState, useSignerRows } from '../../src/signature';
import type { SignerRow } from '../../src/signature';
import { StampToken } from '../../src/stamp';
import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../../src/stamp';
import FormHarness from '../fixtures/FormHarness.svelte';
import Probes from '../fixtures/Probes.svelte';
import { signal } from '../fixtures/signal.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * The signature binding: an empty signature field in `<FormLayer>` is "sign here" (a click makes
 * it the target, which `useSignatureState()` follows), against the real engine; and
 * `useSignerRows()` follows the people whose marks the stamp plugin holds.
 */

const here = dirname(fileURLToPath(import.meta.url));
const packages = resolve(here, '..', '..', '..', '..');
const fixtures = resolve(packages, 'engine', 'main', 'test', 'fixtures');
const wasmPath = resolve(packages, 'engine', 'runtime', 'npm', 'wasm32', 'lib', 'embedpdf.wasm');

describe('a signature field in the form layer', () => {
  it('makes an empty field the target the next mark goes to', { timeout: 45_000 }, async () => {
    const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
    // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
    const wasmBinary = new Uint8Array(await readFile(wasmPath));
    const engine = (await createLocalEngine({
      runtime: { prefer: 'wasm', wasmBinary },
    })) as unknown as Engine;
    const page = signal<PageContextValue | null>(null);
    const target = {
      read: () => useSignatureState(),
      pick: (state: unknown) => (state as { target: unknown }).target,
      seen: [] as unknown[],
    };
    const { kernel, view } = await viewerWith(
      [interactionPlugin(), formPlugin(), signaturePlugin()],
      FormHarness,
      { page, probes: [target] },
      engine,
    );

    try {
      await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
      await waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = kernel.capability(FormToken);
      await form.refresh();
      const ref = kernel.documents.getPage(0, 'blank')!.ref;
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page: ref, rect: { x: 72, y: 560, width: 220, height: 64 } }],
      });
      page.value = makePageContext(
        'blank',
        'test-view',
        ref,
        0,
        { top: 0, right: 0, bottom: 0, left: 0 },
        pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
        () => new DOMRect(0, 0, 612, 792),
      );
      flushSync();

      const signHere = await waitFor(() => view.getByRole('button', { name: 'approval' }));
      expect(signHere.hasAttribute('data-signed')).toBe(false);
      expect(latest(target.seen)).toBeNull();

      await fireEvent.click(signHere);
      flushSync();

      // The field's own address, as the form layer's items carry it.
      expect(latest(target.seen)).toEqual(form.get(toFieldRef('approval'))?.ref);
    } finally {
      view.unmount();
      // The kernel closes its documents first (a second destroy joins the viewer's).
      await kernel.destroy();
      await engine.destroy();
    }
  });
});

// ── useSignerRows over a stand-in stamp plugin ──────────────────────────────

interface StampStore {
  readonly libraries: readonly StampLibrary[];
  readonly assets: readonly StampAsset[];
}

/** The two reads `useSignerRows()` makes, and a test hook to add a library with its stamps. */
interface StandInStamp {
  listLibraries(filter?: StampLibraryFilter): readonly StampLibrary[];
  listAssets(filter?: StampAssetFilter): readonly StampAsset[];
  add(library: StampLibrary, assets: readonly StampAsset[]): void;
}

/**
 * A stand-in for the stamp plugin, from a store that changes: the real plugin draws a preview on
 * a canvas when a stamp is made, which happy-dom lacks.
 */
const standInStampPlugin = definePlugin<StampStore, StampCapability>({
  id: 'stamp',
  scope: 'workspace',
  token: StampToken,
  state: (): StampStore => ({ libraries: [], assets: [] }),
  create: (ctx) => {
    const api: StandInStamp = {
      listLibraries: (filter) => {
        const kinds = filter?.kind === undefined ? null : ([] as string[]).concat(filter.kind);
        return ctx.state.get().libraries.filter((library) => !kinds || kinds.includes(library.kind));
      },
      listAssets: (filter) =>
        ctx.state
          .get()
          .assets.filter((asset) => !filter?.libraryId || asset.libraryId === filter.libraryId),
      add: (library, assets) =>
        ctx.state.update((store) => ({
          libraries: [...store.libraries, library],
          assets: [...store.assets, ...assets],
        })),
    };
    return { api: api as unknown as StampCapability };
  },
});

const assetOf = (libraryId: string, name: string): StampAsset => ({
  id: `${libraryId}:${name}`,
  libraryId,
  kind: 'stamp' as StampAsset['kind'],
  name,
  label: name,
  size: { width: 100, height: 40 },
  page: toPageRef(1),
});

describe('useSignerRows', () => {
  it('lists each person of a signatures library with their signature and initials', async () => {
    const rows = {
      read: () => useSignerRows(),
      pick: (result: unknown) => (result as CurrentValue<readonly SignerRow[]>).current,
      seen: [] as unknown[],
    };
    const { kernel } = await viewerWith([standInStampPlugin], Probes, { probes: [rows] });
    expect(latest(rows.seen)).toEqual([]);

    const stamp = kernel.capability(StampToken) as unknown as StandInStamp;
    // A stamps library is no person.
    stamp.add({ id: 'office', name: 'Office', kind: 'stamps', assetIds: [] }, [
      assetOf('office', 'Approved'),
    ]);
    const signature = assetOf('ada', 'signature');
    const initials = assetOf('ada', 'initials');
    stamp.add({ id: 'ada', name: 'Ada Lovelace', kind: 'signatures', assetIds: [] }, [
      signature,
      initials,
    ]);
    flushSync();

    const people = latest(rows.seen) as readonly SignerRow[];
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({
      libraryId: 'ada',
      name: 'Ada Lovelace',
      signatures: [signature],
      initials,
    });
  });
});

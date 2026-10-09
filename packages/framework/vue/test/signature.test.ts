import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computed, h, shallowRef } from 'vue';
import type { Ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { pageTransform } from '@embedpdf/core-geometry';
import { definePlugin, toPageRef } from '@embedpdf/core';
import type { Engine } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { FormLayer, FormToken, formPlugin, toFieldRef } from '../src/form';
import { interactionPlugin } from '../src/interaction';
import { makePageContext, providePage } from '../src/runtime';
import type { PageContextValue } from '../src/runtime';
import { signaturePlugin, useSignatureState, useSignerRows } from '../src/signature';
import type { SignerRow } from '../src/signature';
import { StampToken } from '../src/stamp';
import type {
  StampAsset,
  StampAssetFilter,
  StampCapability,
  StampLibrary,
  StampLibraryFilter,
} from '../src/stamp';
import { probe, settle, viewerWith } from './counter-plugin';

/**
 * The signature binding: an empty signature field in `<FormLayer>` is "sign
 * here" (a click makes it the target), against the real engine; and
 * `useSignerRows()` follows the people whose marks the stamp plugin holds.
 */

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const wasm = resolve(
  here,
  '..',
  '..',
  '..',
  'engine',
  'runtime',
  'npm',
  'wasm32',
  'lib',
  'embedpdf.wasm',
);

describe('a signature field in the form layer', () => {
  it('makes an empty field the target the next mark goes to', { timeout: 45_000 }, async () => {
    const bytes = new Uint8Array(await readFile(resolve(fixtures, 'hello_world.pdf')));
    // happy-dom's browser-shaped globals would steer the wasm toward fetch(): hand it over.
    const wasmBinary = new Uint8Array(await readFile(wasm));
    const engine = (await createLocalEngine({
      runtime: { prefer: 'wasm', wasmBinary },
    })) as unknown as Engine;
    const context = shallowRef<PageContextValue | null>(null);
    let target!: Readonly<Ref<unknown>>;
    const Reader = probe(() => {
      ({ target } = useSignatureState());
    });
    const Page = probe(() => {
      providePage(computed(() => context.value as PageContextValue));
      return () => (context.value ? h(FormLayer) : null);
    });
    const { kernel, wrapper } = await viewerWith(
      [interactionPlugin(), formPlugin(), signaturePlugin()],
      () => [h(Reader), h(Page)],
      engine,
    );

    try {
      await kernel.documents.open({ kind: 'bytes', id: 'blank', bytes });
      await vi.waitFor(() => expect(kernel.tryCapability(FormToken, undefined)).toBeTruthy(), {
        timeout: 20_000,
      });
      const form = kernel.capability(FormToken);
      await form.refresh();
      const page = kernel.documents.getPage(0, 'blank')!.ref;
      await form.create({
        family: 'signature',
        name: 'approval',
        widgets: [{ page, rect: { x: 72, y: 560, width: 220, height: 64 } }],
      });
      context.value = makePageContext(
        'blank',
        'test-view',
        page,
        0,
        { top: 0, right: 0, bottom: 0, left: 0 },
        pageTransform({ pageSize: { width: 612, height: 792 }, rotation: 0, scale: 1, dpr: 1 }),
        () => new DOMRect(0, 0, 612, 792),
      );

      const signHere = await vi.waitFor(() => {
        const found = document.querySelector<HTMLButtonElement>('button[aria-label="approval"]');
        if (!found) throw new Error('no signature field yet');
        return found;
      });
      expect(signHere.hasAttribute('data-signed')).toBe(false);
      expect(target.value).toBeNull();

      signHere.click();
      await settle();

      // The field's own address, as the form layer's items carry it.
      expect(target.value).toEqual(form.get(toFieldRef('approval'))?.ref);
    } finally {
      wrapper.unmount();
      // The kernel closes its documents first (a second destroy joins the Viewer's).
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
 * A stand-in for the stamp plugin, from a store that changes: the real plugin
 * draws a preview on a canvas when a stamp is made, which happy-dom lacks.
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

enableAutoUnmount(afterEach);

describe('useSignerRows', () => {
  it('lists each person of a signatures library with their signature and initials', async () => {
    let rows!: Readonly<Ref<readonly SignerRow[]>>;
    const Reader = probe(() => {
      rows = useSignerRows();
    });
    const { kernel } = await viewerWith([standInStampPlugin], () => h(Reader));
    await settle();
    expect(rows.value).toEqual([]);

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
    await settle();

    expect(rows.value).toHaveLength(1);
    expect(rows.value[0]).toMatchObject({
      libraryId: 'ada',
      name: 'Ada Lovelace',
      signatures: [signature],
      initials,
    });
  });
});

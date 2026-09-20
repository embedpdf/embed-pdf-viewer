/**
 * The shipped default libraries (`packages/default-stamps/<locale>/stamps.pdf`)
 * re-imported through the plugin with NO overrides — the gate that the
 * conversion wrote exactly what the plugin reads: title, registry order,
 * identifiers, labels, kind, and one library identity across locales.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';
import type { PluginContext } from '@embedpdf/core';
import { createLocalEngine } from '@embedpdf/engine';
import { LOCALES as SHIPPED, loadDefaultLibrary } from '@embedpdf/default-stamps/library';

import { createStampCapability } from '../src/capability';
import { initialStampState, stampReducer } from '../src/reducer';
import type { StampAction, StampState } from '../src/types';

const here = dirname(fileURLToPath(import.meta.url));
// The release consume gate supplies the extracted npm tarball, so missing
// packaged manifests/PDFs fail the same compatibility checks as source changes.
const packageDir =
  process.env.EMBEDPDF_DEFAULT_STAMPS_DIR ?? resolve(here, '..', '..', '..', 'default-stamps');
const LOCALES = ['en', 'de', 'nl', 'fr', 'es', 'zh-CN', 'sv', 'ja'] as const;
/** The library id every locale carries (PieceInfo `Id`). */
const LIBRARY_ID = 'embedpdf-standard';
/** Stable ids shipped by v2; consumers may select a stamp by this id. */
const LEGACY_STAMP_IDS = [
  'approved',
  'not-approved',
  'draft',
  'final',
  'completed',
  'confidential',
  'for-public-release',
  'not-for-public-release',
  'for-comment',
  'void',
  'preliminary-results',
  'information-only',
  'witness',
  'initial-here',
  'sign-here',
  'accepted',
  'rejected',
];

const EXPECTED: Record<string, { name: string; keys: readonly string[] }> = {
  en: {
    name: 'Standard Stamps',
    keys: [
      'Approved=Approved',
      'NotApproved=Not Approved',
      'Draft=Draft',
      'Final=Final',
      'Completed=Completed',
      'Confidential=Confidential',
      'ForPublicRelease=For Public Release',
      'NotForPublicRelease=Not for Public Release',
      'ForComment=For Comment',
      'Void=Void',
      'PreliminaryResults=Preliminary Results',
      'InformationOnly=Information Only',
      'Witness=Witness',
      'InitialHere=Initial Here',
      'SignHere=Sign Here',
      'Accepted=Accepted',
      'Rejected=Rejected',
    ],
  },
  de: {
    name: 'Standardstempel',
    keys: [
      'Approved=Genehmigt',
      'NotApproved=Nicht genehmigt',
      'Draft=Entwurf',
      'Final=Endgültig',
      'Completed=Abgeschlossen',
      'Confidential=Vertraulich',
      'ForPublicRelease=Zur Veröffentlichung',
      'NotForPublicRelease=Nicht zur Veröffentlichung',
      'ForComment=Zur Stellungnahme',
      'Void=Ungültig',
      'PreliminaryResults=Vorläufige Ergebnisse',
      'InformationOnly=Nur zur Information',
      'Witness=Zeuge',
      'InitialHere=Initialen hier',
      'SignHere=Hier unterschreiben',
      'Accepted=Akzeptiert',
      'Rejected=Abgelehnt',
    ],
  },
  nl: {
    name: 'Standaard stempels',
    keys: [
      'Approved=Goedgekeurd',
      'NotApproved=Niet goedgekeurd',
      'Draft=Concept',
      'Final=Definitief',
      'Completed=Voltooid',
      'Confidential=Vertrouwelijk',
      'ForPublicRelease=Voor publicatie',
      'NotForPublicRelease=Niet voor publicatie',
      'ForComment=Ter beoordeling',
      'Void=Ongeldig',
      'PreliminaryResults=Voorlopige resultaten',
      'InformationOnly=Alleen ter informatie',
      'Witness=Getuige',
      'InitialHere=Initialen hier',
      'SignHere=Hier ondertekenen',
      'Accepted=Geaccepteerd',
      'Rejected=Afgewezen',
    ],
  },
  fr: {
    name: 'Tampons standards',
    keys: [
      'Approved=Approuvé',
      'NotApproved=Non approuvé',
      'Draft=Brouillon',
      'Final=Final',
      'Completed=Terminé',
      'Confidential=Confidentiel',
      'ForPublicRelease=Pour diffusion publique',
      'NotForPublicRelease=Ne pas diffuser',
      'ForComment=Pour commentaire',
      'Void=Nul',
      'PreliminaryResults=Résultats préliminaires',
      'InformationOnly=Pour information uniquement',
      'Witness=Témoin',
      'InitialHere=Initiales ici',
      'SignHere=Signer ici',
      'Accepted=Accepté',
      'Rejected=Rejeté',
    ],
  },
  es: {
    name: 'Sellos estándar',
    keys: [
      'Approved=Aprobado',
      'NotApproved=No aprobado',
      'Draft=Borrador',
      'Final=Final',
      'Completed=Completado',
      'Confidential=Confidencial',
      'ForPublicRelease=Para publicación',
      'NotForPublicRelease=No para publicación',
      'ForComment=Para comentario',
      'Void=Nulo',
      'PreliminaryResults=Resultados preliminares',
      'InformationOnly=Solo informativo',
      'Witness=Testigo',
      'InitialHere=Iniciales aquí',
      'SignHere=Firmar aquí',
      'Accepted=Aceptado',
      'Rejected=Rechazado',
    ],
  },
  'zh-CN': {
    name: '标准印章',
    keys: [
      'Approved=已批准',
      'NotApproved=未批准',
      'Draft=草稿',
      'Final=最终版',
      'Completed=已完成',
      'Confidential=机密',
      'ForPublicRelease=可公开发布',
      'NotForPublicRelease=不可公开发布',
      'ForComment=待评论',
      'Void=作废',
      'PreliminaryResults=初步结果',
      'InformationOnly=仅供参考',
      'Witness=见证人',
      'InitialHere=在此签名缩写',
      'SignHere=在此签名',
      'Accepted=已接受',
      'Rejected=已拒绝',
    ],
  },
  sv: {
    name: 'Standardstämplar',
    keys: [
      'Approved=Godkänd',
      'NotApproved=Ej godkänd',
      'Draft=Utkast',
      'Final=Slutgiltig',
      'Completed=Slutförd',
      'Confidential=Konfidentiellt',
      'ForPublicRelease=För publicering',
      'NotForPublicRelease=Ej för publicering',
      'ForComment=För kommentar',
      'Void=Ogiltig',
      'PreliminaryResults=Preliminära resultat',
      'InformationOnly=Endast information',
      'Witness=Vittne',
      'InitialHere=Initialer här',
      'SignHere=Signera här',
      'Accepted=Godtagen',
      'Rejected=Avvisad',
    ],
  },
  ja: {
    name: '標準スタンプ',
    keys: [
      'Approved=承認済み',
      'NotApproved=未承認',
      'Draft=下書き',
      'Final=最終版',
      'Completed=完了',
      'Confidential=機密',
      'ForPublicRelease=公開用',
      'NotForPublicRelease=非公開',
      'ForComment=コメント用',
      'Void=無効',
      'PreliminaryResults=暫定結果',
      'InformationOnly=参考情報',
      'Witness=証人',
      'InitialHere=イニシャル記入欄',
      'SignHere=署名欄',
      'Accepted=受理済み',
      'Rejected=却下',
    ],
  },
};

/** Minimal PNG header: signature + IHDR with width=100, height=50. */
const pngBytes = () => {
  const b = new Uint8Array(32);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(8, 13);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  dv.setUint32(16, 100);
  dv.setUint32(20, 50);
  return b;
};

/** Node has no PNG encoder: keep every PDF operation real and stub only the
 *  thumbnail encode at the asset-engine boundary. */
function nodeAssetEngine(engine: Engine): Engine {
  const bindAll = <T extends object>(target: T, key: PropertyKey) => {
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  };
  return {
    open: async (input: Parameters<Engine['open']>[0], options?: Parameters<Engine['open']>[1]) => {
      const doc = await engine.open(input, options);
      return new Proxy(doc, {
        get(targetDoc, property) {
          if (property !== 'page') return bindAll(targetDoc, property);
          return (pageObjectNumber: number) => {
            const page = targetDoc.page(pageObjectNumber);
            return new Proxy(page, {
              get(targetPage, pageProperty) {
                if (pageProperty !== 'render') return bindAll(targetPage, pageProperty);
                return new Proxy(targetPage.render, {
                  get(targetRender, renderProperty) {
                    if (renderProperty === 'image') {
                      return async () => ({
                        contentType: 'image/png',
                        source: { kind: 'bytes', bytes: pngBytes() },
                      });
                    }
                    return bindAll(targetRender, renderProperty);
                  },
                });
              },
            });
          };
        },
      }) as DocumentHandle;
    },
    destroy: () => engine.destroy(),
  } as unknown as Engine;
}

function makeCtx(engine: Engine) {
  let state: StampState = initialStampState();
  return {
    id: 'stamp',
    engine,
    doc: null,
    getState: () => state,
    dispatch: (action: StampAction) => {
      state = stampReducer(state, action);
    },
    subscribe: () => () => {},
    core: () => ({ documents: {}, order: [], activeId: null }),
    document: () => null,
    documentHandle: () => null,
    cleanup: () => {},
    forDocument: () => {
      throw new Error('no document');
    },
    tryForDocument: () => null,
  } as unknown as PluginContext<StampState, StampAction>;
}

const libraryPdf = async (locale: string) =>
  new Uint8Array(await readFile(resolve(packageDir, locale, 'stamps.pdf')));

describe('@embedpdf/default-stamps', () => {
  let engine: Engine;
  beforeAll(async () => {
    engine = nodeAssetEngine(await createLocalEngine({ runtime: { prefer: 'wasm' } }));
  });
  afterAll(async () => {
    await engine.destroy();
  });

  for (const locale of LOCALES) {
    it(`${locale}: preserves the v2 manifest and its PDF page-index mapping`, async () => {
      const manifest = JSON.parse(
        await readFile(resolve(packageDir, locale, 'manifest.json'), 'utf8'),
      );
      expect(manifest).toEqual({
        id: 'standard',
        name: EXPECTED[locale].name,
        categories: ['sidebar'],
        pdf: 'stamps.pdf',
        stamps: EXPECTED[locale].keys.map((key, pageIndex) => {
          const [name, subject] = key.split('=');
          return { id: LEGACY_STAMP_IDS[pageIndex], pageIndex, name, subject };
        }),
      });

      // V2 ignores the registry and renders by pageIndex. Prove each legacy
      // entry still addresses the page that v3 identifies by name and label.
      const doc = await engine.open(
        { kind: 'bytes', id: `v2-stamps-${locale}`, bytes: await libraryPdf(locale) },
        { scope: ['*'] },
      );
      try {
        const layout = await doc.pages.list();
        expect(layout.pageCount).toBe(17);
        for (const entry of manifest.stamps) {
          const page = layout.pages.find((page) => page.index === entry.pageIndex);
          expect(page).toBeDefined();
          expect(layout.namedPages).toContainEqual({
            name: `${entry.name}=${entry.subject}`,
            target: { kind: 'page', pageObjectNumber: page!.pageObjectNumber },
          });
        }
      } finally {
        await doc.close();
      }
    });

    it(`${locale}: re-imports with no overrides as the manifest described it`, async () => {
      const ctx = makeCtx(engine);
      const stamp = createStampCapability(ctx, { assetEngine: engine });
      const libraryId = await stamp.importLibraryPdf(await libraryPdf(locale));
      expect(libraryId).toBe(LIBRARY_ID);
      const library = stamp.library(libraryId)!;
      expect(library.name).toBe(EXPECTED[locale].name);
      expect(library.categories).toBeUndefined();
      const assets = stamp.assets(libraryId);
      expect(assets.map((asset) => `${asset.name}=${asset.label}`)).toEqual(EXPECTED[locale].keys);
      expect(assets.every((asset) => asset.kind === 'stamp' && asset.subject === undefined)).toBe(
        true,
      );
      // Page order == registry order: the n-th asset is the n-th page.
      const pons = assets.map((asset) => asset.pageObjectNumber);
      expect([...new Set(pons)]).toHaveLength(pons.length);
      for (const asset of assets) {
        expect(asset.size.width).toBeGreaterThan(0);
        expect(asset.size.height).toBeGreaterThan(0);
        expect(stamp.assetBytes(asset.id)?.length ?? 0).toBeGreaterThan(0);
      }
    });
  }

  it('the module-graph loader hands out exactly the shipped bytes', async () => {
    expect([...SHIPPED]).toEqual([...LOCALES]);
    for (const locale of LOCALES) {
      const viaModule = await loadDefaultLibrary(locale);
      expect(viaModule, locale).toEqual(await libraryPdf(locale));
    }
    expect(await loadDefaultLibrary('xx-YY')).toEqual(await libraryPdf('en'));
  });

  it('exports what it imported: a second import of the export is identical', async () => {
    const ctx = makeCtx(engine);
    const stamp = createStampCapability(ctx, { assetEngine: engine });
    const id = await stamp.importLibraryPdf(await libraryPdf('nl'));
    const exported = stamp.exportLibrary(id)!;
    const again = createStampCapability(makeCtx(engine), { assetEngine: engine });
    const id2 = await again.importLibraryPdf(exported);
    expect(id2).toBe(id);
    expect(again.library(id2)!.name).toBe(EXPECTED.nl.name);
    expect(again.assets(id2).map((a) => `${a.name}=${a.label}`)).toEqual(EXPECTED.nl.keys);
  });

  it('two locales import side by side: one identity, two libraries', async () => {
    const ctx = makeCtx(engine);
    const stamp = createStampCapability(ctx, { assetEngine: engine });
    const en = await stamp.importLibraryPdf(await libraryPdf('en'));
    const nl = await stamp.importLibraryPdf(await libraryPdf('nl'));
    expect(en).toBe(LIBRARY_ID);
    expect(nl).not.toBe(en);
    expect(stamp.library(nl)!.name).toBe(EXPECTED.nl.name);
    expect(stamp.assets(en)).toHaveLength(17);
    expect(stamp.assets(nl)).toHaveLength(17);
    // Same identifiers, different labels — the locale is the only difference.
    expect(stamp.assets(nl).map((a) => a.name)).toEqual(stamp.assets(en).map((a) => a.name));
  });
});

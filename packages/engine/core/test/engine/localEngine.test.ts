/**
 * The local checks: `isLocalEngine`, `isLocalDocument` and `isLocalPage` pass
 * only what carries the local brand, and narrow the shared types to the local
 * ones so local-only members type-check without `?` or `!`.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import type { DocumentHandle } from '../../src/engine/DocumentHandle';
import type { Engine } from '../../src/engine/Engine';
import { isLocalDocument, type LocalDocumentHandle } from '../../src/engine/LocalDocumentHandle';
import { isLocalEngine, type LocalEngine } from '../../src/engine/LocalEngine';
import { LOCAL_ENGINE_BRAND } from '../../src/engine/localEngineBrand';
import { isLocalPage, type LocalPageHandle } from '../../src/engine/LocalPageHandle';
import type { PageHandle } from '../../src/engine/PageHandle';

const branded = <T>(value: object): T => ({ ...value, [LOCAL_ENGINE_BRAND]: true }) as T;
const plain = <T>(value: object): T => value as T;

describe('local checks', () => {
  it('pass only a value with the local brand', () => {
    expect(isLocalEngine(branded<Engine>({}))).toBe(true);
    expect(isLocalDocument(branded<DocumentHandle>({}))).toBe(true);
    expect(isLocalPage(branded<PageHandle>({}))).toBe(true);

    // Members alone never make a value local: a cloud engine has `open` too.
    expect(isLocalEngine(plain<Engine>({ open: () => {}, warmup: () => {} }))).toBe(false);
    expect(isLocalDocument(plain<DocumentHandle>({ downloadLayer: () => {} }))).toBe(false);
    expect(isLocalPage(plain<PageHandle>({}))).toBe(false);
    expect(isLocalEngine(plain<Engine>({ [LOCAL_ENGINE_BRAND]: 'yes' }))).toBe(false);
    expect(isLocalEngine(null as unknown as Engine)).toBe(false);
  });

  it('share the brand across copies of the package', () => {
    // `Symbol.for`: a second bundled copy of engine-core recognises the same engine.
    const engine = plain<Engine>({ [Symbol.for('@embedpdf/engine/local')]: true });
    expect(isLocalEngine(engine)).toBe(true);
  });

  it('narrow the shared types to the local ones', () => {
    const engine = {} as Engine;
    // @ts-expect-error `warmup` is local-only: it isn't on the shared engine.
    void engine.warmup;
    if (isLocalEngine(engine)) expectTypeOf(engine).toEqualTypeOf<LocalEngine>();

    const doc = {} as DocumentHandle;
    // @ts-expect-error `downloadLayer` is local-only.
    void doc.downloadLayer;
    if (isLocalDocument(doc)) {
      expectTypeOf(doc).toEqualTypeOf<LocalDocumentHandle>();
      expectTypeOf(doc.page).returns.toEqualTypeOf<LocalPageHandle>();
    }

    const page = { render: {} } as PageHandle;
    // @ts-expect-error raw pixels are local-only.
    void page.render.raw;
    if (isLocalPage(page)) expectTypeOf(page).toEqualTypeOf<LocalPageHandle>();
  });
});

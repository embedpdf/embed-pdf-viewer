/**
 * A page picture draws the annotations and form fields the caller may read:
 * an option left out draws what they may see, and asking for what they may
 * not read is refused, naming the option.
 */
import { describe, expect, test } from 'vitest';
import { APPEARANCE_STATES_FIXTURE_PDF } from '@embedpdf/engine-core/conformance';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type PageRenderOptions,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

// The fixture's check box (green while off) fills 20..60 and its square
// (cyan) 100..140, both 140..180 from the top of a 200 × 200 page.
const GREEN = [0, 255, 0];
const CYAN = [0, 255, 255];
const WHITE = [255, 255, 255];

describe('page pictures draw what the caller may read (local engine)', () => {
  test.each([
    {
      who: 'everything',
      scope: ['*'],
      shows: { box: GREEN, square: CYAN },
    },
    {
      who: 'a filler, who may not read annotations',
      scope: ['doc.open', 'doc.render', 'doc.forms.fill'],
      shows: { box: WHITE, square: WHITE },
      refused: { includeAnnotations: true },
    },
    {
      who: 'a commenter, who may not read the form',
      scope: ['doc.open', 'doc.render', 'doc.annotate.read'],
      shows: { box: WHITE, square: CYAN },
      refused: { includeFormFields: true },
    },
  ])('$who', async ({ scope, shows, refused }) => {
    const engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    try {
      const doc = await engine.open(
        { kind: 'bytes', id: `render-rights-${scope.join()}`, bytes: APPEARANCE_STATES_FIXTURE_PDF.slice() },
        { scope },
      );
      const { pages } = await doc.pages.list();
      const page = doc.page(toPageRef(pages[0]!.ref.objectNumber));
      const middles = async (options: PageRenderOptions = {}) => {
        const raster = await page.render.raw({ viewport: { kind: 'scale', scale: 1 }, ...options });
        const bytes = new Uint8Array(raster.data);
        const at = (x: number, y: number) => {
          const i = y * raster.stride + x * 4;
          return [bytes[i]!, bytes[i + 1]!, bytes[i + 2]!];
        };
        return { box: at(40, 160), square: at(120, 160) };
      };

      expect(await middles()).toEqual(shows);
      expect(await middles({ includeAnnotations: false })).toEqual({ box: WHITE, square: WHITE });

      if (refused) {
        const [option] = Object.keys(refused);
        const error = await middles(refused).then(
          () => null,
          (reason: unknown) => reason,
        );
        expect(EngineError.is(error, EngineErrorCode.Forbidden)).toBe(true);
        expect((error as EngineError).details).toMatchObject({ context: option });
      }
    } finally {
      await engine.destroy();
    }
  });
});

/**
 * Regression: a widget style patch through the ANNOTATION plane followed by a
 * value write through the FORM plane must both be visible in the appearance
 * render — the exact interleaving a viewer produces (style a field in design
 * mode, then fill it). Guards the "yellow background lost / committed text
 * invisible" bug class where the appearance raster came back empty or one
 * write behind.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type {
  AnnotationRef,
  DocumentHandle,
  Engine,
  FormFieldDTO,
} from '@embedpdf/engine-core/runtime';
import { createLocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  '..',
  'examples',
  'snippet-react',
  'public',
  'form.pdf',
);

interface Raster {
  data: ArrayBuffer;
  width: number;
  height: number;
  stride: number;
}

/** Count pixels matching a predicate over RGBA. */
function countPixels(
  raster: Raster,
  match: (r: number, g: number, b: number, a: number) => boolean,
): number {
  const bytes = new Uint8Array(raster.data);
  let n = 0;
  for (let y = 0; y < raster.height; y++) {
    const row = y * raster.stride;
    for (let x = 0; x < raster.width; x++) {
      const i = row + x * 4;
      if (match(bytes[i]!, bytes[i + 1]!, bytes[i + 2]!, bytes[i + 3]!)) n++;
    }
  }
  return n;
}

describe('widget appearance refresh across planes (engine-local, wasm)', () => {
  let engine: Engine;
  let doc: DocumentHandle;
  let field: FormFieldDTO;
  let widgetRef: AnnotationRef;
  let pon: number;

  beforeAll(async () => {
    engine = await createLocalEngine({ runtime: { prefer: 'wasm' } });
    const bytes = new Uint8Array(await readFile(fixturePath));
    doc = await engine.open({ kind: 'bytes', id: 'form-pdf-widget-ap', bytes });
    const snapshot = await doc.forms.list();
    const found = snapshot.fields.find((f) => f.name === 'First_Name');
    if (!found) throw new Error('fixture is missing the First_Name field');
    field = found;
    const widget = field.widgets[0]!;
    pon = widget.pageObjectNumber;
    widgetRef = {
      kind: 'objectNumber',
      annotObjectNumber: widget.annotObjectNumber,
      pageObjectNumber: pon,
    };
  }, 30_000);

  afterAll(async () => {
    await doc?.close();
    await engine?.destroy();
  });

  /** The widget's appearance raster, or null when none is emitted. */
  async function widgetRaster(): Promise<Raster | null> {
    const result = await doc.page(pon).annotations.renderAppearances({ scale: 2 });
    const entry = result.appearances.find(
      (a) =>
        a.ref.kind === 'objectNumber' &&
        a.ref.annotObjectNumber === (widgetRef as { annotObjectNumber: number }).annotObjectNumber,
    );
    return entry?.raster ?? null;
  }

  test('an annotation-plane style patch shows up in the appearance render', async () => {
    await doc.page(pon).annotations.update(widgetRef, {
      subtype: 'widget',
      interiorColor: { r: 255, g: 213, b: 0 },
    });
    const raster = await widgetRaster();
    expect(raster, 'style patch must produce a renderable /AP').not.toBeNull();
    const yellowish = countPixels(
      raster!,
      (r, g, b, a) => a > 200 && r > 200 && g > 150 && b < 120,
    );
    // The background fill dominates the raster — well over half the pixels.
    expect(yellowish).toBeGreaterThan((raster!.width * raster!.height) / 2);
  });

  test('a form-plane value write is visible in the SAME render pass, not one behind', async () => {
    await doc.forms.setValue(
      { kind: 'objectNumber', fieldObjectNumber: field.fieldObjectNumber },
      { type: 'text', value: 'Hello' },
    );
    const raster = await widgetRaster();
    expect(raster).not.toBeNull();
    // Text glyphs: dark opaque pixels over the yellow fill.
    const dark = countPixels(raster!, (r, g, b, a) => a > 200 && r < 100 && g < 100 && b < 100);
    expect(dark, 'committed text must render immediately').toBeGreaterThan(20);
    // And the earlier style patch must still be there.
    const yellowish = countPixels(
      raster!,
      (r, g, b, a) => a > 200 && r > 200 && g > 150 && b < 120,
    );
    expect(yellowish).toBeGreaterThan((raster!.width * raster!.height) / 3);
  });
});

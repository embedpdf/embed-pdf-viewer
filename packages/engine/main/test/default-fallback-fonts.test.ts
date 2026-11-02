/**
 * The fonts the engine comes with for Hebrew and Arabic
 * (`@embedpdf/default-fallback-fonts`): `localEngine()` adds them as fallback
 * fonts, tried after the app's own, unless told not to.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadFallbackFont } from '@embedpdf/default-fallback-fonts/library';
import { beforeAll, describe, expect, test } from 'vitest';

import { localEngine, type LocalEngine } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

let helloWorld: Uint8Array;

beforeAll(async () => {
  helloWorld = new Uint8Array(await readFile(resolve(here, 'fixtures', 'hello_world.pdf')));
});

/** A free text in Helvetica: what it drew with no font. */
async function write(engine: LocalEngine, contents: string) {
  const doc = await engine.open({ kind: 'bytes', id: contents, bytes: helloWorld.slice() });
  const page = (await doc.pages.list()).pages[0]!;
  const { meta } = await doc.page(page.ref).annotations.create({
    subtype: 'free-text',
    box: { x: 20, y: 20, width: 300, height: 40 },
    contents,
  });
  return { doc, missing: meta.missingCharacters };
}

describe('the default fallback fonts', () => {
  test('draw Hebrew and Arabic with no setup, after the app’s own fallbacks', async () => {
    const engine = localEngine({ runtime: { prefer: 'wasm' } });
    const { doc, missing } = await write(engine, 'שלום مرحبا');
    expect(missing).toBeUndefined();

    const list = await doc.fonts.list();
    expect(list.fallbacks).toEqual([
      'noto-sans-hebrew',
      'noto-sans-hebrew-bold',
      'noto-naskh-arabic',
      'noto-naskh-arabic-bold',
    ]);
    expect(list.fonts.find((font) => font.name === 'noto-sans-hebrew')).toMatchObject({
      source: 'engine',
      familyName: 'Noto Sans Hebrew',
      weight: 400,
    });

    // A fallback of the app's own is tried first, though it was added last:
    // here the bold program, registered as a regular face.
    const bold = await loadFallbackFont('noto-sans-hebrew-bold');
    await engine.fonts.register({ key: 'mine', familyName: 'Mine', weight: 400, data: bold });
    await engine.fonts.addFallback('mine');
    expect((await doc.fonts.list()).fallbacks[0]).toBe('mine');
    const answer = await doc.fonts.resolve({ runs: [{ text: 'שלום', fontFamily: 'helvetica' }] });
    expect(answer.runs[0]!.fallbacks[0]).toBe(sha256(bold));

    // Clearing the fallbacks removes them too.
    await engine.fonts.clearFallbacks();
    expect((await write(engine, 'שלום')).missing).toEqual(['ש', 'ל', 'ו', 'ם']);
    await engine.destroy();
  });

  test('`defaultFallbackFonts: false` leaves them out', async () => {
    const engine = localEngine({ runtime: { prefer: 'wasm' }, defaultFallbackFonts: false });
    const { doc, missing } = await write(engine, 'שלום');
    expect(missing).toEqual(['ש', 'ל', 'ו', 'ם']);
    expect((await doc.fonts.list()).fallbacks).toEqual([]);
    await engine.destroy();
  });
});

/**
 * The app's fonts (the viewer's `fonts` setting), registered once on a local
 * engine: each read once (fetched from `url`, or its `data`) and registered
 * under its key, in the order given. The engine tells every open document its
 * fonts changed, so the fonts plugin lists them (`source: 'engine'`) and the
 * browser draws them by program, as it draws any font. A cloud engine's fonts
 * are its server's: there the setting is ignored, with a warning.
 */
import { useEffect } from 'react';
import { isLocalEngine, useKernel } from '@embedpdf/react/runtime';
import { useConfiguredFonts, type ViewerFont } from '../config-context';

/** A font's bytes: its `data`, or its file fetched from `url`. */
async function bytesOf(font: ViewerFont): Promise<Uint8Array> {
  if (font.data) return new Uint8Array(font.data);
  if (!font.url) throw new Error('a font needs a url or its data');
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${font.url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function AppFonts(): null {
  const kernel = useKernel();
  const fonts = useConfiguredFonts();

  useEffect(() => {
    if (!fonts.length) return;
    if (!isLocalEngine(kernel.engine)) {
      console.warn(
        '[embedpdf] the `fonts` setting is ignored: only a local engine takes an app’s fonts. ' +
          'A cloud engine’s fonts are its server’s.',
      );
      return;
    }
    const engineFonts = kernel.engine.fonts;
    let cancelled = false;
    // Fetched together, registered in order: the order the font list keeps.
    const loads = fonts.map((font) => bytesOf(font));
    void (async () => {
      for (const [index, font] of fonts.entries()) {
        try {
          const data = await loads[index]!;
          if (cancelled) return;
          await engineFonts.register({
            key: font.key,
            familyName: font.familyName,
            weight: font.weight,
            italic: font.italic,
            data,
          });
        } catch (error) {
          console.warn(`[embedpdf] font "${font.key}" was not registered:`, error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [kernel, fonts]);

  return null;
}

/**
 * The engine's configured fonts (`engine.fonts`), loaded once per viewer: read
 * the bytes (fetched from `url`, or `data`) → register them on the viewer's
 * engine under the key (what a free-text `fontFamily` carries and what the
 * engine embeds) → mount the same bytes as a `@font-face` for that key (the
 * family the plugin's `cssFontFamily` emits for a registered font, so the live
 * editor renders the face the appearance stream will bake). The style panel
 * lists a font only once both have happened — an offered key always resolves
 * on write.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isLocalEngine, useKernel } from '@embedpdf/react/runtime';
import { mountWebFont } from '@embedpdf/web';
import { useConfiguredFonts, type ViewerFont } from '../config-context';

export interface LoadedAnnotationFont {
  readonly key: string;
  readonly label: string;
}

const LoadedFontsContext = createContext<readonly LoadedAnnotationFont[]>([]);

/** A font's bytes: its `data`, or its file fetched from `url`. */
async function bytesOf(font: ViewerFont): Promise<Uint8Array> {
  if (font.data) return new Uint8Array(font.data);
  if (!font.url) throw new Error('a font needs a url or its data');
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${font.url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function AnnotationFontsProvider({ children }: { children: ReactNode }) {
  const kernel = useKernel();
  const fonts = useConfiguredFonts();
  const [loaded, setLoaded] = useState<readonly LoadedAnnotationFont[]>([]);

  useEffect(() => {
    // The cloud engine registers no fonts (a server policy), so a key could
    // never resolve on write: offer nothing rather than a font that fails.
    if (!fonts.length || !isLocalEngine(kernel.engine)) return;
    const engineFonts = kernel.engine.fonts;
    let cancelled = false;
    const unmounts: Array<() => void> = [];
    void (async () => {
      for (const font of fonts) {
        try {
          const bytes = await bytesOf(font);
          if (cancelled) return;
          await engineFonts.register({
            key: font.key,
            familyName: font.familyName,
            weight: font.weight,
            italic: font.italic,
            data: bytes,
          });
          const unmount = await mountWebFont(font.key, bytes, {
            weight: font.weight,
            style: font.italic ? 'italic' : 'normal',
          });
          if (cancelled) {
            unmount();
            return;
          }
          unmounts.push(unmount);
          setLoaded((previous) =>
            previous.some((existing) => existing.key === font.key)
              ? previous
              : [...previous, { key: font.key, label: font.familyName ?? font.key }],
          );
        } catch (error) {
          console.warn(`[embedpdf] engine font "${font.key}" was not loaded:`, error);
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const unmount of unmounts) unmount();
    };
  }, [kernel, fonts]);

  return <LoadedFontsContext.Provider value={loaded}>{children}</LoadedFontsContext.Provider>;
}

/** The configured fonts that are registered and mounted, in config order. */
export function useAnnotationFonts(): readonly LoadedAnnotationFont[] {
  return useContext(LoadedFontsContext);
}

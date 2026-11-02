/**
 * The browser's text measuring, for the kernel:
 * `createKernel({ measurer: browserTextMeasurer() })`. A plugin that lays text
 * out as the engine does (a form field's value, drawn before the engine's
 * picture arrives) asks how wide a run is in a font program, as this browser
 * shapes it: canvas `measureText` in the program, which is mounted the first
 * time it is asked about and stays mounted for the page's life (whatever
 * draws the text mounts it too). A program the browser refuses (its font
 * sanitizer rejects a malformed one whole) is never ready, and says so.
 * Structurally `HostTextMeasurer` from `@embedpdf/core`, declared here so
 * this package stays dependency-free.
 */
import { mountFontProgram, type MountableFontProgram } from './web-font';

/** Structural twin of `HostTextMeasurer` (`@embedpdf/core`). */
export interface WebTextMeasurer {
  ready(program: MountableFontProgram): boolean;
  refused(program: MountableFontProgram): boolean;
  width(program: MountableFontProgram, text: string, rtl: boolean): number;
  onChange(listener: () => void): () => void;
}

/** The size text is measured at: a width in pixels is then one in thousandths of an em. */
const MEASURED_SIZE = 1000;

/**
 * The browser's measurer. A page without a canvas (some test environments)
 * measures every text as `0` wide.
 */
export function browserTextMeasurer(options: { document?: Document } = {}): WebTextMeasurer {
  const states = new Map<string, 'loading' | 'ready' | 'refused'>();
  const listeners = new Set<() => void>();
  const settle = (family: string, state: 'ready' | 'refused') => {
    states.set(family, state);
    for (const listener of [...listeners]) listener();
  };
  let context: CanvasRenderingContext2D | null | undefined;

  const contextOf = (): CanvasRenderingContext2D | null => {
    if (context === undefined) {
      const doc = options.document ?? (typeof document === 'undefined' ? undefined : document);
      context = doc?.createElement('canvas').getContext('2d') ?? null;
    }
    return context;
  };

  return {
    ready(program) {
      const known = states.get(program.family);
      if (known) return known === 'ready';
      states.set(program.family, 'loading');
      void program.load().then(
        (bytes) =>
          mountFontProgram({ ...program, load: async () => bytes }, options).then(
            () => settle(program.family, 'ready'),
            () => settle(program.family, 'refused'),
          ),
        // Bytes that didn't load are asked for again the next time.
        () => states.delete(program.family),
      );
      return false;
    },
    refused: (program) => states.get(program.family) === 'refused',
    width(program, text, rtl) {
      const ctx = contextOf();
      if (!ctx) return 0;
      ctx.font = `${program.style} ${program.weight} ${MEASURED_SIZE}px "${program.family}"`;
      ctx.direction = rtl ? 'rtl' : 'ltr';
      return ctx.measureText(text).width;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

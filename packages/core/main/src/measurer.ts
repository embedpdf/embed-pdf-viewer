/**
 * Text measuring, as the host does it. A plugin that lays text out the way
 * the engine does (a form field's text, drawn before the engine's picture
 * arrives) needs how wide a run is in a font program, shaped as the browser
 * that draws it shapes it. Only the host can say: it asks its context
 * (`ctx.measurer`), and the host that built the kernel says how to measure
 * (`createKernel({ measurer })`).
 *
 * - A browser host passes `browserTextMeasurer()` from `@embedpdf/web`:
 *   canvas `measureText`, with each program mounted the first time it is
 *   asked about. The framework viewers do this.
 * - Without one, `ctx.measurer` is `null`, and a plugin draws only what it
 *   can measure without it.
 */

/** A font program the host loads to measure with: structurally `@embedpdf/core-fonts`' `MountableFontProgram`. */
export interface HostFontProgram {
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  load(): Promise<Uint8Array>;
}

/** What a host provides: how wide text is in a font program. */
export interface HostTextMeasurer {
  /**
   * Whether `program` is loaded, so text in it can be measured; when it
   * isn't, the host starts loading it and says so through `onChange`.
   */
  ready(program: HostFontProgram): boolean;
  /**
   * Whether the host tried `program` and can't use it (a browser refuses a
   * malformed font whole): it never becomes ready. Asking loads nothing.
   */
  refused(program: HostFontProgram): boolean;
  /**
   * How wide `text` is in a ready `program`, shaped as one run (right to left
   * when `rtl`), in thousandths of an em.
   */
  width(program: HostFontProgram, text: string, rtl: boolean): number;
  /**
   * Calls `listener` each time a program the host was loading is ready or
   * refused; returns the unsubscribe.
   */
  onChange(listener: () => void): () => void;
}

/**
 * The host's measurer as one plugin instance sees it: its `onChange`
 * listeners go when the instance closes (`lifetime` aborts).
 */
export function instanceMeasurer(host: HostTextMeasurer, lifetime: AbortSignal): HostTextMeasurer {
  return {
    ready: (program) => host.ready(program),
    refused: (program) => host.refused(program),
    width: (program, text, rtl) => host.width(program, text, rtl),
    onChange(listener) {
      if (lifetime.aborted) return () => {};
      const stop = host.onChange(listener);
      const close = () => stop();
      lifetime.addEventListener('abort', close, { once: true });
      return () => {
        lifetime.removeEventListener('abort', close);
        stop();
      };
    },
  };
}

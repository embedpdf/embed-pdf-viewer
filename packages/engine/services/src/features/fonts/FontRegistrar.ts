import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type { PdfFileAccessHandle, PdfRuntimeModule } from '@embedpdf/engine-runtime';

/**
 * A font to register at thread startup from a local file. Used by hosts that
 * own their font policy (the cloud server's fallback fonts), as opposed to the
 * per-request `fonts.register` wire path the browser engine drives.
 *
 * Registration is by path, mirroring how the server opens base documents
 * (`fileAccess.fromNodeFile`): the bytes are range-read on demand and never
 * held resident in the JS heap, so a deployment can configure many large
 * fallback fonts (CJK families) without paying RAM per font.
 */
export interface StartupFontSpec {
  key: string;
  /** Absolute path to a TTF/OTF file (native/node runtimes only). */
  path: string;
  familyName?: string;
  weight?: number;
  /** `undefined` → infer from the file. */
  italic?: boolean;
  /** Also add to the glyph-fallback chain (automatic missing-glyph fill). */
  fallback?: boolean;
}

/**
 * Thread-confined runtime font registry binding.
 *
 * Wraps the `EPDFFont_*` C API on a single PDFium thread. PDFium's font
 * registry is thread-local: a font registered here is visible only to this
 * thread's page rendering and annotation-authoring calls, and the numeric
 * `CFX_FontRegistry::FontId` it returns is a per-thread `next_font_id++`.
 *
 * That id is volatile, so we never let it cross the worker boundary. The host
 * owns the `fontKey → id` map (passed in by reference) and every wire message
 * references the stable `fontKey`. The FreeText writer resolves a key to the
 * current thread's id through {@link idFor} at authoring time.
 *
 * Lives in `engine-services` (not a worker host) so the browser Web Worker,
 * the Node `worker_thread` server, and any future direct-thread embedding
 * share the exact same binding — only the `PdfRuntimeModule` (WASM vs native)
 * differs.
 */
export class FontRegistrar {
  /**
   * File-access handles retained for path-registered fonts. PDFium range-reads
   * the file lazily (on each face creation), so the FPDF_FILEACCESS must stay
   * alive until the registry is cleared — same lifetime rule as a file-backed
   * base document. Closed in {@link clear}.
   */
  private readonly fileHandles: PdfFileAccessHandle[] = [];

  constructor(
    private readonly runtime: PdfRuntimeModule,
    /** Host-owned `fontKey → native FontId` map for this thread. */
    private readonly ids: Map<string, number>,
  ) {}

  /**
   * Register a font from its bytes. Copies into the WASM heap, hands the
   * pointer to `EPDFFont_RegisterMemFont64` (which copies the bytes into the
   * native registry), then frees the scratch — so the heap holds exactly one
   * retained copy per registered font.
   *
   * Throws `InvalidArg` when the runtime rejects the font (corrupt, no glyphs).
   */
  register(
    fontKey: string,
    familyName: string,
    weight: number,
    italic: number,
    bytes: Uint8Array,
  ): void {
    if (bytes.byteLength === 0) {
      throw new EngineError(EngineErrorCode.InvalidArg, `empty font data: ${fontKey}`);
    }
    const { mem, fn } = this.runtime;
    const ptr = mem.alloc(bytes.byteLength);
    try {
      mem.writeBytes(ptr, bytes);
      const id = fn.EPDFFont_RegisterMemFont64(familyName, weight, italic, ptr, bytes.byteLength);
      if (id === 0) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `font registration failed (unloadable or no glyphs): ${fontKey}`,
        );
      }
      this.ids.set(fontKey, id);
    } finally {
      mem.free(ptr);
    }
  }

  /**
   * Register a font from a local file via `EPDFFont_RegisterFont`. The runtime
   * range-reads the file on demand (it is not loaded into the JS heap), and the
   * file-access handle is retained until {@link clear}. Native/node only.
   *
   * Throws `InvalidArg` when the runtime rejects the font (corrupt, no glyphs).
   */
  registerFromNodeFile(
    fontKey: string,
    familyName: string,
    weight: number,
    italic: number,
    path: string,
  ): void {
    const access = this.runtime.fileAccess.fromNodeFile(path);
    let id = 0;
    try {
      id = this.runtime.fn.EPDFFont_RegisterFont(familyName, weight, italic, access.ptr);
    } catch (error) {
      access.close();
      throw error;
    }
    if (id === 0) {
      access.close();
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `font registration failed (unloadable or no glyphs): ${fontKey} (${path})`,
      );
    }
    this.ids.set(fontKey, id);
    this.fileHandles.push(access);
  }

  /**
   * Register host-owned startup fonts on this thread, in order, optionally
   * adding each to the fallback chain. Order matters: it fixes both the native
   * FontIds and the fallback precedence, so every worker thread that runs the
   * same list ends up identical.
   */
  registerStartup(specs: readonly StartupFontSpec[]): void {
    for (const spec of specs) {
      const italic = spec.italic === undefined ? -1 : spec.italic ? 1 : 0;
      this.registerFromNodeFile(
        spec.key,
        spec.familyName ?? '',
        spec.weight ?? 0,
        italic,
        spec.path,
      );
      if (spec.fallback) {
        this.addFallback(spec.key);
      }
    }
  }

  /** Append a registered font to the ordered glyph-fallback chain. */
  addFallback(fontKey: string): void {
    const id = this.requireId(fontKey);
    if (!this.runtime.fn.EPDFFont_AddFallbackFont(id)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `addFallback failed: ${fontKey}`);
    }
  }

  clearFallbacks(): void {
    this.runtime.fn.EPDFFont_ClearFallbackFonts();
  }

  /** Unregister every font and reset the fallback chain (clears the map too). */
  clear(): void {
    this.runtime.fn.EPDFFont_ClearRegisteredFonts();
    this.ids.clear();
    // Native registry no longer reads through these — release the file handles.
    for (const access of this.fileHandles) {
      access.close();
    }
    this.fileHandles.length = 0;
  }

  /** Resolve a stable key to this thread's native FontId. Throws if unknown. */
  idFor(fontKey: string): number {
    return this.requireId(fontKey);
  }

  private requireId(fontKey: string): number {
    const id = this.ids.get(fontKey);
    if (id === undefined) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `font not registered on this thread: ${fontKey}`,
      );
    }
    return id;
  }
}
